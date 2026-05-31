import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  colors,
  fontWeight,
  radius,
  spacing,
  tracking,
} from "../constants/design";
import { fontStyle, MonoText } from "../constants/typography";
import {
  TEAM_COLORS,
  teamColorHex,
  type TeamColorKey,
} from "../constants/team-colors";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { useTeam } from "../lib/team-context";
import { LeaguePicker } from "../components/teams/LeaguePicker";

type GameFormat = "4v4" | "5v5" | "7v7" | "other";
type CreatorRole = "coach" | "captain" | "league_admin_only";

const FORMAT_OPTIONS: { value: GameFormat; label: string; dots: number }[] = [
  { value: "4v4", label: "4v4", dots: 4 },
  { value: "5v5", label: "5v5", dots: 5 },
  { value: "7v7", label: "7v7", dots: 7 },
  { value: "other", label: "Custom", dots: 0 },
];

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export default function TeamSetupScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refreshTeam } = useTeam();
  const router = useRouter();
  // Three mutually-exclusive entry modes:
  //   ?role=coach|captain — set by /onboarding/role for the single-team
  //     branch. Otherwise undefined; the draft's stored role wins.
  //   ?draftId=<uuid> — tapping a draft card on /dashboard or a league
  //     dashboard. Loads that specific draft, autosaves continue.
  //   ?editTeamId=<uuid> — tapping "Edit team info" in Settings on an
  //     already-active team. Loads the team's fields, hides the role
  //     picker, suppresses autosave, and the submit button becomes
  //     "Update <name>" hitting a direct UPDATE instead of activate.
  const params = useLocalSearchParams<{
    role?: string;
    draftId?: string;
    editTeamId?: string;
  }>();
  const isEditMode = !!params.editTeamId;
  // creatorRole values:
  //   'captain' / 'coach' → the creator joins the team in that role
  //   'league_admin_only' → the creator is a league admin not on this
  //                         team; activate_team skips both the
  //                         team_members insert AND the roster row.
  // Defaults: 'captain' for standalone teams (the user is creating a
  // team they're personally on). When a league gets picked AND the
  // user hasn't explicitly chosen a role yet, we flip the default to
  // 'league_admin_only' so they opt INTO coach/captain rather than
  // being auto-added.
  const initialRole: CreatorRole =
    params.role === "coach" ? "coach" : "captain";
  const [creatorRole, setCreatorRole] = useState<CreatorRole>(initialRole);
  // True once the user (or URL param, or draft load) makes an explicit
  // pick. Suppresses the "auto-flip default based on league context"
  // effect below so we never overwrite an explicit choice.
  const roleExplicit = useRef<boolean>(!!params.role);

  const [name, setName] = useState("");
  const [format, setFormat] = useState<GameFormat>("5v5");
  const [color, setColor] = useState<TeamColorKey>("orange");
  // null = standalone team. Set by LeaguePicker; hidden entirely when
  // the user has no leagues so the field stays out of the way for the
  // common single-team flow.
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft persistence state ────────────────────────────────────────────
  // draftId: server-side id of the draft this form is bound to. Null
  // until the first successful upsert. Once set, all subsequent upserts
  // and the final activate_team call use it.
  const [draftId, setDraftId] = useState<string | null>(null);
  // saveState drives the footer's save indicator. 'unsaved' means the
  // form has dirty fields not yet flushed; 'saving' means a request is
  // in flight; 'saved' means the latest snapshot is on the server;
  // 'error' surfaces the last RPC failure under the indicator.
  const [saveState, setSaveState] = useState<
    "idle" | "unsaved" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // hydrated flips true once the mount-time load completes. Without
  // this guard the debounced upsert would fire on initial mount with
  // empty form fields and create a placeholder draft for every visit.
  const hydrated = useRef(false);
  // draftIdRef mirrors draftId so the debounced upsert closure always
  // sees the latest id without us having to chain useCallback deps.
  const draftIdRef = useRef<string | null>(null);
  // roleRef does the same for creatorRole — the upsert reads this at
  // fire time rather than capturing it in the dep array.
  const roleRef = useRef<CreatorRole>(creatorRole);
  useEffect(() => { roleRef.current = creatorRole; }, [creatorRole]);
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  // Translate the local role enum to the RPC's nullable p_role:
  // 'league_admin_only' rides as NULL because activate_team uses
  // creator_role IS NULL to mean "skip team_members + roster row."
  const rpcRole = (r: CreatorRole): "coach" | "captain" | null =>
    r === "league_admin_only" ? null : r;

  const trimmedName = name.trim();
  const colorHex = teamColorHex(color);
  const initials = useMemo(() => {
    const words = trimmedName.split(/\s+/).filter(Boolean);
    if (words.length === 0) return "—";
    return words.map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }, [trimmedName]);


  // ── Edit-mode load ────────────────────────────────────────────────
  //
  // When ?editTeamId is set we're modifying an existing active team.
  // Load the columns we expose in the form, prefill state, and leave
  // hydrated permanently false so the autosave effect never fires —
  // edit mode commits all changes through the explicit Update button,
  // not through debounced upserts. RLS allows any team member to read
  // their team.
  useEffect(() => {
    if (!user) return;
    if (!isEditMode) return;
    let cancelled = false;
    (async () => {
      const { data, error: loadError } = await supabase
        .from("teams")
        .select("id, team_name, format, team_color, league_id")
        .eq("id", params.editTeamId)
        .maybeSingle();
      if (cancelled) return;
      if (loadError) {
        console.warn("[team-setup] edit load failed:", loadError.message);
        setError(loadError.message);
        return;
      }
      if (!data) {
        setError("Team not found.");
        return;
      }
      const row = data as {
        id: string;
        team_name: string | null;
        format: string | null;
        team_color: string | null;
        league_id: string | null;
      };
      setName(row.team_name ?? "");
      if (row.format === "4v4" || row.format === "5v5" || row.format === "7v7") {
        setFormat(row.format);
      } else if (row.format) {
        setFormat("other");
      }
      if (row.team_color) {
        setColor(row.team_color as TeamColorKey);
      }
      setLeagueId(row.league_id);
      // hydrated stays false in edit mode so autosave can't fire.
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isEditMode, params.editTeamId]);

  // ── Draft load on mount ───────────────────────────────────────────
  //
  // Only loads when ?draftId is explicitly passed (from tapping a
  // draft card on /dashboard or a league dashboard). The "+ Add team"
  // entry always starts fresh — no auto-pickup of the user's most
  // recent draft.
  //
  // hydrated.current flips true at the end of mount in BOTH paths so
  // the debounced upsert knows the next field change is real user
  // input (not initial state-setting from the load).
  useEffect(() => {
    if (!user) return;
    if (isEditMode) return; // edit mode owns hydration
    if (!params.draftId) {
      hydrated.current = true;
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: loadError } = await supabase
        .from("teams")
        .select(
          "id, team_name, format, team_color, league_id, creator_role",
        )
        .eq("id", params.draftId)
        .eq("created_by", user.id)
        .eq("status", "draft")
        .maybeSingle();
      if (cancelled) return;
      if (loadError && loadError.code !== "PGRST116") {
        // PGRST116 = no rows; the draftId may have been activated
        // or discarded between the tap and this load. Fall through
        // to a fresh form rather than blocking.
        console.warn("[team-setup] draft load failed:", loadError.message);
      }
      if (data) {
        const row = data as {
          id: string;
          team_name: string | null;
          format: string | null;
          team_color: string | null;
          league_id: string | null;
          creator_role: string | null;
        };
        setDraftId(row.id);
        // "Untitled team" is the server-side default for empty drafts;
        // don't bring it back into the visible name field — let the
        // placeholder show instead.
        setName(row.team_name === "Untitled team" ? "" : (row.team_name ?? ""));
        if (row.format === "4v4" || row.format === "5v5" || row.format === "7v7") {
          setFormat(row.format);
        } else if (row.format) {
          setFormat("other");
        }
        if (row.team_color) {
          setColor(row.team_color as TeamColorKey);
        }
        setLeagueId(row.league_id);
        // Restore the saved creator_role. NULL on a draft with a
        // league means "league admin only"; NULL on a standalone draft
        // is a legacy null we treat as 'captain' so the user isn't
        // surprised by a missing-from-roster outcome.
        if (row.creator_role === "coach" || row.creator_role === "captain") {
          setCreatorRole(row.creator_role);
        } else if (row.league_id) {
          setCreatorRole("league_admin_only");
        } else {
          setCreatorRole("captain");
        }
        // Any prior draft is an explicit prior choice — don't let the
        // league-flip effect overwrite it.
        roleExplicit.current = true;
        setSaveState("saved");
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only run on user/draftId change — the rest of state
    // is what we're loading INTO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.draftId, isEditMode]);

  // ── Debounced auto-save ───────────────────────────────────────────
  //
  // 500ms after the latest field change, push the snapshot through
  // upsert_team_draft. Skips:
  //   - pre-hydration (initial mount state-setting doesn't trigger)
  //   - empty name (don't create a placeholder draft on every form
  //     open; the team needs at least a name before we persist)
  //   - in-flight submit (activation owns the row at that point)
  useEffect(() => {
    if (!hydrated.current) return;
    if (submitting) return;
    if (!trimmedName) return;

    setSaveState("unsaved");
    const handle = setTimeout(async () => {
      setSaveState("saving");
      const formatToPersist = format === "other" ? null : format;
      const { data, error: rpcError } = await supabase.rpc("upsert_team_draft", {
        p_team_id: draftIdRef.current,
        p_team_name: trimmedName,
        p_format: formatToPersist ?? "7v7",
        p_team_color: color,
        p_role: rpcRole(roleRef.current),
        p_league_id: leagueId,
      });
      if (rpcError) {
        setSaveState("error");
        setSaveError(rpcError.message);
        return;
      }
      const returnedId = data as string | null;
      if (returnedId && returnedId !== draftIdRef.current) {
        setDraftId(returnedId);
      }
      setSaveError(null);
      setSaveState("saved");
    }, 500);
    return () => clearTimeout(handle);
  }, [
    trimmedName,
    format,
    color,
    leagueId,
    creatorRole,
    submitting,
  ]);

  async function handleSubmit() {
    if (submitting) return;
    if (!trimmedName) {
      setError("Please name your team first.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const formatToPersist = format === "other" ? null : format;

    // Edit mode: commit fields directly via UPDATE. No drafts, no
    // activate, no onboarding-complete write — the team is already
    // active and the user is already past onboarding.
    if (isEditMode && params.editTeamId) {
      const { error: updateError } = await supabase
        .from("teams")
        .update({
          team_name: trimmedName,
          format: formatToPersist ?? "7v7",
          team_color: color,
          league_id: leagueId,
        })
        .eq("id", params.editTeamId);
      if (updateError) {
        setError(updateError.message);
        setSubmitting(false);
        return;
      }
      await refreshTeam();
      setSubmitting(false);
      // Back to wherever they came from (Settings, typically).
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/dashboard");
      }
      return;
    }

    // Synchronous final flush: the debounced auto-save may have a
    // pending upsert in flight or queued. Run one inline so the data
    // landing in the activated team matches whatever the user sees on
    // screen at submit time. This also guarantees draftId exists for
    // first-time activations (no prior auto-save fired yet).
    const { data: upsertData, error: upsertError } = await supabase.rpc(
      "upsert_team_draft",
      {
        p_team_id: draftIdRef.current,
        p_team_name: trimmedName,
        p_format: formatToPersist ?? "7v7",
        p_team_color: color,
        p_role: rpcRole(creatorRole),
        p_league_id: leagueId,
      },
    );
    if (upsertError) {
      setError(upsertError.message);
      setSubmitting(false);
      return;
    }
    const finalDraftId = (upsertData as string | null) ?? draftIdRef.current;
    if (!finalDraftId) {
      setError("Couldn't save draft before activating. Try again.");
      setSubmitting(false);
      return;
    }

    const { error: activateError } = await supabase.rpc("activate_team", {
      p_team_id: finalDraftId,
    });
    if (activateError) {
      setError(activateError.message);
      setSubmitting(false);
      return;
    }

    // Mark onboarding complete so the §7 backfill modal can gate on this
    // field correctly. Fire-and-forget — a write failure here shouldn't
    // block the redirect.
    if (user) {
      await supabase
        .from("profiles")
        .update({
          onboarding_completed_at: new Date().toISOString(),
          onboarding_step: 4,
        })
        .eq("id", user.id)
        .is("onboarding_completed_at", null);
    }

    await refreshTeam();
    setSubmitting(false);
    router.replace("/dashboard");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.sm,
          paddingBottom: insets.bottom + 120,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TopBar
          onClose={() => {
            // If team-setup is sitting on top of another screen (league
            // dashboard or /dashboard via "+ Add team"), pop the stack
            // to whatever they came from. Cold-start / direct nav can't
            // pop, so fall back to /dashboard explicitly.
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/dashboard");
            }
          }}
        />
        <HeroPreview
          name={trimmedName || "Untitled team"}
          colorHex={colorHex}
          initials={initials}
          format={format}
        />

        <View
          style={{
            paddingTop: spacing["3xl"],
            paddingHorizontal: 22,
            gap: 26,
          }}
        >
          <NumberedField index="01" label="Name your team">
            <TextInput
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (error) setError(null);
              }}
              placeholder="e.g., Purple Falcons"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!submitting}
              style={{
                height: 54,
                paddingHorizontal: 16,
                borderRadius: 12,
                backgroundColor: colors.surface.overlay,
                borderWidth: 1,
                borderColor: colors.border.strong,
                color: colors.text.primary,
                fontSize: 17,
                fontWeight: fontWeight.semibold,
                ...fontStyle("semibold"),
              }}
            />
          </NumberedField>

          <NumberedField index="02" label="Pick your game">
            <Segmented
              value={format}
              onChange={(v) => {
                lightTap();
                setFormat(v);
              }}
              options={FORMAT_OPTIONS}
            />
          </NumberedField>

          <NumberedField
            index="03"
            label="Choose your color"
            trailing={
              <MonoText
                weight="medium"
                style={{ fontSize: 10.5, color: colorHex }}
              >
                {colorHex.toUpperCase()}
              </MonoText>
            }
          >
            <ColorSwatchRow
              value={color}
              onChange={(c) => {
                lightTap();
                setColor(c);
              }}
            />
          </NumberedField>

          {/* Smart picker — renders only when the caller has at least one
              league. Standalone is always an option. The chosen value
              flows to upsert_team_draft(p_league_id => ...). When the
              user crosses the standalone↔league boundary without ever
              tapping the role picker themselves, we flip the role
              default: standalone → 'captain', league → 'league_admin_only'.
              An explicit pick (URL ?role, draft load, or tapping the
              role picker) latches roleExplicit and stops the flip. */}
          <LeaguePicker
            selected={leagueId}
            onChange={(nextLeagueId) => {
              setLeagueId(nextLeagueId);
              if (roleExplicit.current) return;
              if (nextLeagueId === null) {
                setCreatorRole("captain");
              } else {
                setCreatorRole("league_admin_only");
              }
            }}
          />

          {/* Role picker — only when in league context. Standalone teams
              implicitly default to captain (the user is creating a team
              they're personally on); a league admin needs to make this
              decision explicitly so we don't auto-add them to teams
              they're not actually on. */}
          {/* Role picker only matters at team-creation time (it
              decides team_members + roster inserts). For edits, the
              membership is already set; changing it is out of scope. */}
          {leagueId && !isEditMode ? (
            <RolePicker
              value={creatorRole}
              onChange={(r) => {
                roleExplicit.current = true;
                setCreatorRole(r);
              }}
            />
          ) : null}

        </View>

        {error && (
          <View style={{ paddingHorizontal: 22, marginTop: spacing["2xl"] }}>
            <Text
              style={[
                fontStyle("medium"),
                {
                  fontSize: 13,
                  color: colors.errorLight,
                },
              ]}
            >
              {error}
            </Text>
          </View>
        )}
      </ScrollView>

      <Footer
        teamName={trimmedName || "team"}
        canSubmit={!!trimmedName && !submitting}
        submitting={submitting}
        // Edit mode hides the autosave indicator (no autosave fires)
        // and changes the CTA verb from "Create" → "Update".
        saveState={isEditMode ? "idle" : saveState}
        saveError={isEditMode ? null : saveError}
        submitVerb={isEditMode ? "Update" : "Create"}
        progressVerb={isEditMode ? "Updating…" : "Creating…"}
        onSubmit={handleSubmit}
        bottomInset={insets.bottom}
      />
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components

function TopBar({ onClose }: { onClose: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 18,
        paddingBottom: 14,
      }}
    >
      <Pressable
        onPress={onClose}
        accessibilityLabel="Sign out"
        hitSlop={8}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: pressed ? colors.surface.pressed : "rgba(255,255,255,0.05)",
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <Ionicons name="close" size={18} color={colors.text.primary} />
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <MonoText
          weight="bold"
          style={{
            fontSize: 11,
            fontWeight: fontWeight.bold,
            color: colors.orange[500],
            letterSpacing: 1.7,
          }}
        >
          .01
        </MonoText>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 11,
              fontWeight: fontWeight.bold,
              color: colors.text.secondary,
              letterSpacing: 1.7,
            },
          ]}
        >
          NEW TEAM
        </Text>
      </View>

      <View style={{ width: 36 }} />
    </View>
  );
}

function HeroPreview({
  name,
  colorHex,
  initials,
  format,
}: {
  name: string;
  colorHex: string;
  initials: string;
  format: GameFormat;
}) {
  const formatLabel = format === "other" ? "Custom" : format;
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View
        style={{
          borderRadius: 22,
          padding: 22,
          paddingTop: 28,
          backgroundColor: colors.surface.raised,
          borderWidth: 1,
          borderColor: "rgba(255,106,26,0.18)",
          overflow: "hidden",
        }}
      >
        {/* Top radial bloom */}
        <LinearGradient
          colors={["rgba(255,106,26,0.20)", "rgba(255,106,26,0)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
          pointerEvents="none"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Yard markers */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 14,
            left: 22,
            right: 22,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          {["10", "20", "30", "40", "50"].map((y) => (
            <MonoText
              key={y}
              weight="medium"
              style={{
                fontSize: 9,
                color: "rgba(244,244,242,0.18)",
                letterSpacing: 0.9,
                fontWeight: fontWeight.semibold,
              }}
            >
              {y}
            </MonoText>
          ))}
        </View>

        {/* Live preview eyebrow */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 10,
            marginBottom: 18,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.lime[400],
              shadowColor: colors.lime[400],
              shadowOpacity: 0.6,
              shadowRadius: 4,
            }}
          />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 11,
                fontWeight: fontWeight.bold,
                color: colors.lime[400],
                letterSpacing: tracking.loose,
                textTransform: "uppercase",
              },
            ]}
          >
            Live preview
          </Text>
        </View>

        {/* Badge + name row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View
            style={{
              width: 78,
              height: 78,
              borderRadius: 39,
              backgroundColor: colorHex,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: colorHex,
              shadowOpacity: 0.4,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              borderWidth: 3,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <MonoText
              weight="bold"
              style={{
                fontSize: 30,
                fontWeight: fontWeight.bold,
                color: colors.surface.base,
                letterSpacing: tracking.tight,
              }}
            >
              {initials}
            </MonoText>
          </View>

          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 10,
                  fontWeight: fontWeight.bold,
                  color: colors.text.secondary,
                  letterSpacing: tracking.loose,
                  textTransform: "uppercase",
                },
              ]}
            >
              Team
            </Text>
            <Text
              numberOfLines={1}
              style={[
                fontStyle("bold"),
                {
                  fontSize: 22,
                  fontWeight: fontWeight.bold,
                  color: colors.text.primary,
                  letterSpacing: tracking.tight,
                  lineHeight: 24,
                },
              ]}
            >
              {name}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: radius.pill,
                  backgroundColor: "rgba(255,255,255,0.08)",
                }}
              >
                <MonoText
                  weight="medium"
                  style={{
                    fontSize: 11,
                    fontWeight: fontWeight.semibold,
                    color: colors.text.primary,
                  }}
                >
                  {formatLabel}
                </MonoText>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function NumberedField({
  index,
  label,
  muted = false,
  trailing,
  children,
}: {
  index: string;
  label: string;
  muted?: boolean;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <MonoText
          weight="bold"
          style={{
            fontSize: 11,
            fontWeight: fontWeight.bold,
            color: muted ? colors.text.muted : colors.orange[500],
            letterSpacing: 1.5,
          }}
        >
          {index}
        </MonoText>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 11,
              fontWeight: fontWeight.bold,
              color: colors.text.secondary,
              letterSpacing: tracking.loose,
              textTransform: "uppercase",
            },
          ]}
        >
          {label}
        </Text>
        {trailing && <View style={{ flex: 1, alignItems: "flex-end" }}>{trailing}</View>}
      </View>
      {children}
    </View>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: GameFormat;
  onChange: (v: GameFormat) => void;
  options: { value: GameFormat; label: string; dots: number }[];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface.overlay,
        borderWidth: 1,
        borderColor: colors.border.strong,
        borderRadius: 12,
        padding: 4,
        gap: 2,
      }}
    >
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 9,
              backgroundColor: selected ? colors.orange[500] : "transparent",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 6,
            }}
          >
            {o.dots > 0 && (
              <FieldIcon
                dots={o.dots}
                color={selected ? colors.surface.base : colors.text.secondary}
              />
            )}
            <Text
              style={[
                fontStyle("semibold"),
                {
                  fontSize: 13,
                  fontWeight: fontWeight.semibold,
                  color: selected ? colors.surface.base : colors.text.secondary,
                },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FieldIcon({ dots, color }: { dots: number; color: string }) {
  // Mini SVG-less rendition of the field icon: rounded box with vertical lines.
  const lines = Array.from({ length: dots });
  return (
    <View
      style={{
        width: 18,
        height: 11,
        borderRadius: 1.5,
        borderWidth: 1,
        borderColor: color,
        opacity: 0.7,
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: 2.5,
        alignItems: "stretch",
      }}
    >
      {lines.map((_, i) => (
        <View
          key={i}
          style={{
            width: 0.6,
            backgroundColor: color,
            opacity: 0.6,
          }}
        />
      ))}
    </View>
  );
}

function ColorSwatchRow({
  value,
  onChange,
}: {
  value: TeamColorKey;
  onChange: (v: TeamColorKey) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
      {TEAM_COLORS.map((c) => {
        const selected = value === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => onChange(c.id)}
            accessibilityLabel={`Select ${c.label}`}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c.hex,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: selected ? colors.text.primary : "transparent",
              shadowColor: selected ? colors.surface.base : "transparent",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: selected ? 1 : 0,
              shadowRadius: selected ? 0 : 0,
            }}
          >
            {selected && (
              <Ionicons name="checkmark" size={16} color={colors.surface.base} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// Three-card stack used in the team-setup form when leagueId is set.
// "League admin only" is the default for league-context teams so we
// honor the spec's "NOT auto-added unless they explicitly check"
// rule. The other two opt the league admin onto the team.
function RolePicker({
  value,
  onChange,
}: {
  value: CreatorRole;
  onChange: (next: CreatorRole) => void;
}) {
  const options: {
    value: CreatorRole;
    label: string;
    body: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
  }[] = [
    {
      value: "league_admin_only",
      label: "Just the league admin",
      body: "I'm not coaching or playing on this team.",
      icon: "trophy-outline",
    },
    {
      value: "coach",
      label: "I'll coach this team",
      body: "Run practices and manage the team. Not on the roster.",
      icon: "clipboard-outline",
    },
    {
      value: "captain",
      label: "I'll play as captain",
      body: "Run the team and play. Adds me to the roster with a captain tag.",
      icon: "star-outline",
    },
  ];
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.text.label,
          fontWeight: fontWeight.medium,
          marginBottom: 4,
        }}
      >
        Your role on this team?
      </Text>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.85}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              padding: 14,
              borderRadius: radius.lg,
              backgroundColor: selected
                ? "rgba(255,106,26,0.10)"
                : colors.surface.raised,
              borderWidth: 1.5,
              borderColor: selected
                ? colors.orange[500]
                : colors.border.default,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: selected
                  ? colors.orange[500]
                  : "rgba(255,255,255,0.04)",
                borderWidth: selected ? 0 : 1,
                borderColor: colors.border.default,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={opt.icon}
                size={18}
                color={selected ? colors.text.onBrand : colors.text.secondary}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={[
                  fontStyle("semibold"),
                  {
                    fontSize: 14,
                    fontWeight: fontWeight.semibold,
                    color: colors.text.primary,
                  },
                ]}
              >
                {opt.label}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 17,
                  color: colors.text.secondary,
                }}
              >
                {opt.body}
              </Text>
            </View>
            {selected ? (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.orange[500]}
              />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

// Replaces the old "Auto-saved" pill which was always shown when the
// form had a name — misleading because nothing was actually being
// persisted. Now reflects the real draft-save lifecycle from the
// debounced upsert: idle (no draft yet), unsaved (dirty edits not
// flushed), saving (RPC in flight), saved (latest snapshot landed),
// error (last RPC failed, with the message surfaced underneath).
function SaveIndicator({
  state,
  error,
}: {
  state: SaveState;
  error: string | null;
}) {
  if (state === "idle") return null;
  let icon: React.ComponentProps<typeof Ionicons>["name"] = "checkmark";
  let label = "Draft saved";
  let color: string = colors.text.muted;
  if (state === "saving") {
    icon = "sync-outline";
    label = "Saving…";
  } else if (state === "unsaved") {
    icon = "ellipse-outline";
    label = "Unsaved changes";
  } else if (state === "error") {
    icon = "alert-circle-outline";
    label = "Save failed";
    color = colors.error;
  }
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Ionicons name={icon} size={11} color={color} />
        <Text
          style={[
            fontStyle("regular"),
            { fontSize: 11, color },
          ]}
        >
          {label}
        </Text>
      </View>
      {state === "error" && error ? (
        <Text
          style={[
            fontStyle("regular"),
            { fontSize: 10, color: colors.error, maxWidth: 280, textAlign: "center" },
          ]}
          numberOfLines={2}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Footer({
  teamName,
  canSubmit,
  submitting,
  saveState,
  saveError,
  submitVerb,
  progressVerb,
  onSubmit,
  bottomInset,
}: {
  teamName: string;
  canSubmit: boolean;
  submitting: boolean;
  saveState: SaveState;
  saveError: string | null;
  // "Create" for new-team flow, "Update" for edit mode. Plus the
  // in-flight equivalent ("Creating…" / "Updating…").
  submitVerb: string;
  progressVerb: string;
  onSubmit: () => void;
  bottomInset: number;
}) {
  return (
    <View
      style={{
        // Pin to the bottom regardless of how the parent flex resolves.
        // Earlier we tried flex: 1 on the ScrollView so this could sit
        // as a sibling, but some keyboard / nested-view interactions
        // were still pushing it off-screen. Absolute positioning is the
        // pattern used by /onboarding/create-league and never fails.
        // ScrollView's contentContainer pads enough at the bottom
        // (insets.bottom + 120) so the last form content isn't hidden
        // behind this overlay.
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 14,
        paddingBottom: bottomInset + 22,
        paddingHorizontal: 16,
        backgroundColor: colors.surface.base,
        borderTopWidth: 1,
        borderTopColor: colors.border.subtle,
      }}
    >
      {/*
        Expo 54 / RN 0.81 silently drops the style object when Pressable's
        `style` is a function (see memory: feedback_pressable_function_style_broken).
        The button renders at 0 height with no background → user can't
        see the orange CTA. Switched to TouchableOpacity with a static
        style + activeOpacity so the styles actually apply.
      */}
      <TouchableOpacity
        onPress={onSubmit}
        disabled={!canSubmit}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Create team"
        style={{
          height: 52,
          borderRadius: 12,
          backgroundColor: colors.orange[500],
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          opacity: !canSubmit ? 0.55 : 1,
        }}
      >
        <Text
          style={[
            fontStyle("semibold"),
            {
              fontSize: 15,
              fontWeight: fontWeight.semibold,
              color: colors.surface.base,
            },
          ]}
        >
          {submitting ? progressVerb : `${submitVerb} ${teamName}`}
        </Text>
        {!submitting && (
          <Ionicons name="arrow-forward" size={14} color={colors.surface.base} />
        )}
      </TouchableOpacity>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginTop: 14,
        }}
      >
        <SaveIndicator state={saveState} error={saveError} />
      </View>
    </View>
  );
}
