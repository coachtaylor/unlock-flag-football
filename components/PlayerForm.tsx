import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, fontWeight, radius, tracking } from "../constants/design";
import {
  POSITIONS,
  POSITION_SIDE,
  type Side,
  positionColor,
  positionTint,
  sideAccent,
} from "../constants/positions";
import { fontStyle, MonoText } from "../constants/typography";
import {
  playerColorForIndex,
  initialsFromName,
  joinFirstLast,
  splitFirstLast,
} from "../lib/athlete";
import { capitalizeName } from "../lib/format/name";
import { supabase } from "../lib/supabase";
import { AthleteHero } from "./ui/AthleteHero";
import { CaptainInvitePrompt } from "./teams/CaptainInvitePrompt";

export type PlayerFormInitial = {
  id: string;
  playerName: string;
  // Structured name (migration 83). Preferred over splitting playerName when
  // present so a "Mary Jane / Smith" split made on the web round-trips here.
  firstName?: string | null;
  lastName?: string | null;
  positions: string[];
  jerseyNumber: string;
  notes: string;
  // Player's stable color slot (migration 45). Passed through so the
  // hero preview can render the player's real identity color in edit
  // mode. Null in create mode — the helper falls back to muted.
  colorIndex: number | null;
  isCaptain: boolean;
  // Permission tier for captains (migration 82). Only meaningful when
  // isCaptain; null otherwise. full → app login with full access,
  // view → view-only login, none → badge only (no login).
  captainAccess?: CaptainAccess | null;
};

export type CaptainAccess = "full" | "view" | "none";

const CAPTAIN_ACCESS_OPTIONS: { id: CaptainAccess; label: string; hint: string }[] = [
  { id: "full", label: "Full access", hint: "Plan practices, log benchmarks, edit the roster." },
  { id: "view", label: "View only", hint: "Can see everything, can't make changes." },
  { id: "none", label: "No access", hint: "A captain in name only — no app login." },
];

type Props = {
  teamId: string;
  initial?: PlayerFormInitial;
  topInset: number;
};

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function PlayerForm({ teamId, initial, topInset }: Props) {
  const router = useRouter();
  const isEditing = !!initial;
  // PlayerForm always lives inside the tabs navigator (/roster/new and
  // /roster/[id]/edit are both under app/(tabs)/), so this is safe.
  const tabBarHeight = useBottomTabBarHeight();

  const initialFirstLast = useMemo(() => {
    // Prefer the structured columns when the row has them; otherwise derive
    // first/last from the display name (covers rows created before the split).
    if (initial?.firstName != null || initial?.lastName != null) {
      return {
        first: (initial.firstName ?? "").trim(),
        last: (initial.lastName ?? "").trim(),
      };
    }
    return splitFirstLast(initial?.playerName);
  }, [initial?.firstName, initial?.lastName, initial?.playerName]);

  const [first, setFirst] = useState(initialFirstLast.first);
  const [last, setLast] = useState(initialFirstLast.last);
  const [jersey, setJersey] = useState(initial?.jerseyNumber ?? "");
  const [primary, setPrimary] = useState<string | null>(
    initial?.positions?.[0] ?? null
  );
  const [secondary, setSecondary] = useState<string[]>(
    (initial?.positions ?? []).slice(1, 3)
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isCaptain, setIsCaptain] = useState(initial?.isCaptain ?? false);
  const [captainAccess, setCaptainAccess] = useState<CaptainAccess>(
    initial?.captainAccess ?? "full"
  );
  const [usedJerseys, setUsedJerseys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // After saving a captain with full/view access, prompt to generate an
  // invite linked to their player row (mirrors the web flow). The deferred
  // navigation runs when the prompt closes.
  const [invitePrompt, setInvitePrompt] = useState<{
    playerId: string;
    access: "full" | "view";
    after: "back" | "another";
  } | null>(null);

  // Load in-use jersey numbers once on mount (excluding the current player when editing).
  useEffect(() => {
    let cancelled = false;
    async function loadJerseys() {
      const query = supabase
        .from("team_players")
        .select("jersey_number")
        .eq("team_id", teamId)
        .eq("status", "active");
      const { data, error: qErr } = initial?.id
        ? await query.neq("id", initial.id)
        : await query;
      if (cancelled) return;
      if (qErr) {
        console.warn("[player-form] load jerseys:", qErr.message);
        return;
      }
      const nums = (data ?? [])
        .map((r) => (r as { jersey_number: string | null }).jersey_number)
        .filter((n): n is string => !!n && n.trim().length > 0);
      setUsedJerseys(nums);
    }
    loadJerseys();
    return () => {
      cancelled = true;
    };
  }, [teamId, initial?.id]);

  // Reset submit/error state on focus (belt-and-suspenders for warm screens).
  useFocusEffect(
    useCallback(() => {
      setSubmitting(false);
      setError(null);
    }, [])
  );

  const fullName = joinFirstLast(first, last) || "New player";
  const initials = initialsFromName(joinFirstLast(first, last));
  const side: Side | null = primary ? POSITION_SIDE[primary] ?? null : null;
  // In edit mode the hero shows the player's identity color via the
  // colorIndex passed in `initial`. In create mode there's no slot yet
  // (auto-assigned by the trigger on insert) — the helper returns a
  // neutral fallback so the avatar reads as inert until save.
  const accent = playerColorForIndex(initial?.colorIndex ?? null);

  const setPrimaryPos = (id: string) => {
    lightHaptic();
    setPrimary((cur) => (cur === id ? cur : id));
    // If this id was a secondary, lift it out so it's not in both slots.
    setSecondary((s) => s.filter((x) => x !== id));
  };

  const toggleSecondary = (id: string) => {
    if (id === primary) return;
    lightHaptic();
    setSecondary((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(0, 2)
    );
  };

  const resetForm = () => {
    setFirst("");
    setLast("");
    setJersey("");
    setPrimary(null);
    setSecondary([]);
    setNotes("");
    setIsCaptain(false);
    setCaptainAccess("full");
    setError(null);
  };

  const buildPositions = () => {
    if (!primary) return secondary.length > 0 ? secondary : null;
    return [primary, ...secondary];
  };

  const onSubmit = async (mode: "back" | "another") => {
    setError(null);
    const name = joinFirstLast(first, last);
    if (!name) {
      setError("First name is required.");
      return;
    }
    setSubmitting(true);

    const payload = {
      // player_name stays the canonical display field (= first [+ last]);
      // first_name/last_name persist the structured form (migration 83) so
      // the data matches what the web writes.
      player_name: name,
      first_name: first.trim(),
      last_name: last.trim() || null,
      positions: buildPositions(),
      jersey_number: jersey.trim() || null,
      notes: notes.trim() || null,
      is_captain: isCaptain,
      // Permission tier only applies to captains; cleared otherwise.
      captain_access: isCaptain ? captainAccess : null,
    };

    // A captain with full/view access needs a login → offer an invite linked
    // to their player row before leaving the form.
    const wantsInvite =
      isCaptain && (captainAccess === "full" || captainAccess === "view");

    if (isEditing && initial) {
      const { error: updateErr } = await supabase
        .from("team_players")
        .update(payload)
        .eq("id", initial.id);
      if (updateErr) {
        console.warn("[player-form] update failed:", updateErr.message);
        setError(updateErr.message);
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      if (wantsInvite) {
        setInvitePrompt({
          playerId: initial.id,
          access: captainAccess as "full" | "view",
          after: "back",
        });
        return;
      }
      router.back();
      return;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("team_players")
      .insert({ ...payload, team_id: teamId, status: "active" })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      console.warn("[player-form] insert failed:", insertErr?.message);
      setError(insertErr?.message ?? "Couldn't add player.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    if (wantsInvite) {
      setInvitePrompt({
        playerId: inserted.id as string,
        access: captainAccess as "full" | "view",
        after: mode,
      });
      return;
    }
    if (mode === "another") {
      resetForm();
    } else {
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header row */}
      <View
        style={{
          paddingTop: topInset + 6,
          paddingHorizontal: 18,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={10}
          activeOpacity={0.7}
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: "rgba(255,255,255,0.04)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MonoText
            weight="bold"
            style={{
              fontSize: 11,
              fontWeight: fontWeight.bold,
              color: colors.orange[500],
              letterSpacing: tracking.loose,
            }}
          >
            .0{isEditing ? 2 : 1}
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
            ROSTER · {isEditing ? "EDIT" : "NEW"}
          </Text>
        </View>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.lime[400],
            }}
          />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 11,
                fontWeight: fontWeight.bold,
                color: colors.text.muted,
                letterSpacing: tracking.loose,
              },
            ]}
          >
            AUTO
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          // ~140px = footer (buttons + draft hint + padding) and ensures the
          // last form section clears the sticky footer + tab bar.
          paddingBottom: tabBarHeight + 140,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero preview */}
        <View style={{ paddingHorizontal: 16 }}>
          <AthleteHero
            initials={initials}
            fullName={fullName}
            jersey={jersey}
            accent={accent}
            side={side}
            primary={primary}
            secondary={secondary}
            eyebrow={{ label: "Live preview", color: colors.lime[400] }}
          />
        </View>

        {/* 01 Identity */}
        <Section idx="01" title="Identity">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>First name</FieldLabel>
              <FormInput
                value={first}
                onChangeText={(v) => setFirst(capitalizeName(v))}
                placeholder="Marcus"
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>Last name</FieldLabel>
              <FormInput
                value={last}
                onChangeText={(v) => setLast(capitalizeName(v))}
                placeholder="Johnson"
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
          </View>
          <View style={{ marginTop: 14 }}>
            <FieldLabel>Jersey #</FieldLabel>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <FormInput
                value={jersey}
                onChangeText={(v) => setJersey(v.replace(/\D/g, "").slice(0, 3))}
                placeholder="7"
                keyboardType="number-pad"
                mono
                style={{
                  width: 92,
                  textAlign: "center",
                  fontSize: 18,
                  fontWeight: fontWeight.bold,
                }}
              />
              {usedJerseys.length > 0 ? (
                <Text
                  style={[
                    fontStyle("regular"),
                    {
                      flex: 1,
                      fontSize: 11,
                      color: colors.text.muted,
                      lineHeight: 16,
                    },
                  ]}
                  numberOfLines={2}
                >
                  Numbers{" "}
                  <Text style={{ color: colors.text.secondary, fontFamily: "JetBrainsMono_500Medium" }}>
                    {usedJerseys.join(", ")}
                  </Text>{" "}
                  in use.
                </Text>
              ) : null}
            </View>
          </View>
        </Section>

        {/* 02 Position */}
        <Section
          idx="02"
          title="Position"
          sub="Primary first — drives drill targeting."
        >
          <View style={{ gap: 12 }}>
            <PositionGroup
              sideLabel="OFFENSE"
              side="offense"
              positions={POSITIONS.offense}
              primary={primary}
              secondary={secondary}
              onPrimary={setPrimaryPos}
              onSecondary={toggleSecondary}
            />
            <PositionGroup
              sideLabel="DEFENSE"
              side="defense"
              positions={POSITIONS.defense}
              primary={primary}
              secondary={secondary}
              onPrimary={setPrimaryPos}
              onSecondary={toggleSecondary}
            />
          </View>
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 11,
                color: colors.text.muted,
                marginTop: 12,
                lineHeight: 16,
              },
            ]}
          >
            Tap = primary · Long-press = secondary (max 2)
          </Text>
        </Section>

        {/* 03 Captain */}
        <Section
          idx="03"
          title="Captain"
          sub="Flag this player as a team captain."
          optional
        >
          <CaptainToggle
            value={isCaptain}
            onChange={(v) => {
              lightHaptic();
              setIsCaptain(v);
            }}
          />

          {isCaptain ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text
                style={[
                  fontStyle("medium"),
                  {
                    fontSize: 11,
                    color: colors.text.label,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  },
                ]}
              >
                Captain access
              </Text>
              {CAPTAIN_ACCESS_OPTIONS.map((opt) => {
                const on = captainAccess === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => {
                      lightHaptic();
                      setCaptainAccess(opt.id);
                    }}
                    activeOpacity={0.85}
                    accessibilityState={{ selected: on }}
                    style={{
                      padding: 12,
                      borderRadius: radius.input,
                      borderWidth: 1,
                      borderColor: on ? colors.orange[500] : colors.border.card,
                      backgroundColor: on ? colors.orange.tint : colors.surface.input,
                      gap: 3,
                    }}
                  >
                    <Text
                      style={[
                        fontStyle("bold"),
                        { fontSize: 14, color: on ? colors.orange[400] : colors.text.primary },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={[
                        fontStyle("regular"),
                        { fontSize: 12, color: colors.text.muted, lineHeight: 16 },
                      ]}
                    >
                      {opt.hint}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <Text
                style={[
                  fontStyle("regular"),
                  { fontSize: 11.5, color: colors.text.secondary, lineHeight: 16 },
                ]}
              >
                Full or view access needs the captain to have an account — send
                them an invite from the roster to set up their login.
              </Text>
            </View>
          ) : null}
        </Section>

        {/* 04 Notes */}
        <Section idx="04" title="Notes" optional>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Strong arm. Plays catcher in baseball — good for shuttle drills."
            placeholderTextColor={colors.text.muted}
            multiline
            textAlignVertical="top"
            style={[
              fontStyle("regular"),
              {
                minHeight: 88,
                borderRadius: radius.input,
                borderWidth: 1,
                borderColor: colors.border.card,
                backgroundColor: colors.surface.input,
                color: colors.text.primary,
                fontSize: 14,
                lineHeight: 20,
                paddingHorizontal: 14,
                paddingVertical: 12,
              },
            ]}
          />
        </Section>

        {error ? (
          <View style={{ paddingHorizontal: 18, marginTop: 16 }}>
            <Text
              style={[
                fontStyle("medium"),
                { fontSize: 13, color: colors.errorLight },
              ]}
            >
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky footer — sits above the tab bar */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: tabBarHeight,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 16,
          backgroundColor: colors.surface.base,
          borderTopWidth: 1,
          borderTopColor: colors.border.subtle,
        }}
      >
        <View style={{ flexDirection: "row", gap: 10 }}>
          {!isEditing ? (
            <TouchableOpacity
              onPress={() => onSubmit("another")}
              disabled={submitting}
              activeOpacity={0.85}
              accessibilityLabel="Save and add another"
              style={{
                height: 52,
                paddingHorizontal: 16,
                borderRadius: 14,
                backgroundColor: colors.surface.raised,
                borderWidth: 1,
                borderColor: colors.border.default,
                alignItems: "center",
                justifyContent: "center",
                opacity: submitting ? 0.5 : 1,
              }}
            >
              <Text
                style={[
                  fontStyle("semibold"),
                  {
                    fontSize: 13,
                    fontWeight: fontWeight.semibold,
                    color: colors.text.primary,
                  },
                ]}
              >
                Save & add another
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => onSubmit("back")}
            disabled={submitting}
            activeOpacity={0.9}
            accessibilityLabel={isEditing ? "Save changes" : "Add player"}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 14,
              backgroundColor: colors.orange[500],
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              opacity: submitting ? 0.7 : 1,
              shadowColor: colors.orange[500],
              shadowOpacity: 0.35,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 15,
                  fontWeight: fontWeight.bold,
                  color: colors.text.primary,
                  letterSpacing: 0.2,
                },
              ]}
            >
              {submitting
                ? isEditing
                  ? "Saving…"
                  : "Adding…"
                : isEditing
                ? "Save changes"
                : `Add ${first.trim() || "player"}`}
            </Text>
            {!submitting ? (
              <Ionicons name="arrow-forward" size={14} color={colors.text.primary} />
            ) : null}
          </TouchableOpacity>
        </View>
        <View
          style={{
            marginTop: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Ionicons
              name="checkmark"
              size={11}
              color={colors.text.muted}
            />
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 11, color: colors.text.muted },
              ]}
            >
              Draft auto-saved
            </Text>
          </View>
        </View>
      </View>

      {invitePrompt ? (
        <CaptainInvitePrompt
          visible
          teamId={teamId}
          playerId={invitePrompt.playerId}
          playerName={joinFirstLast(first, last) || "this captain"}
          access={invitePrompt.access}
          onClose={() => {
            const after = invitePrompt.after;
            setInvitePrompt(null);
            if (after === "another") resetForm();
            else router.back();
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SECTION + FORM PRIMITIVES
// ──────────────────────────────────────────────────────────────────────

function Section({
  idx,
  title,
  sub,
  optional,
  children,
}: {
  idx: string;
  title: string;
  sub?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 24 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: 10,
          marginBottom: sub ? 4 : 14,
        }}
      >
        <MonoText
          weight="bold"
          style={{
            fontSize: 11,
            fontWeight: fontWeight.bold,
            color: colors.orange[500],
            letterSpacing: 0.4,
          }}
        >
          {idx}
        </MonoText>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 16,
              fontWeight: fontWeight.bold,
              color: colors.text.primary,
              letterSpacing: -0.2,
            },
          ]}
        >
          {title}
        </Text>
        {optional ? (
          <MonoText
            weight="medium"
            style={{
              fontSize: 10,
              color: colors.text.muted,
              marginLeft: 4,
              letterSpacing: tracking.loose,
            }}
          >
            OPTIONAL
          </MonoText>
        ) : null}
      </View>
      {sub ? (
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 12,
              color: colors.text.secondary,
              marginBottom: 14,
              marginLeft: 22,
            },
          ]}
        >
          {sub}
        </Text>
      ) : null}
      <View>{children}</View>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={[
        fontStyle("medium"),
        {
          fontSize: 11,
          color: colors.text.label,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          marginBottom: 8,
          fontWeight: fontWeight.medium,
        },
      ]}
    >
      {children}
    </Text>
  );
}

function FormInput({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  returnKeyType,
  mono,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  returnKeyType?: "done" | "go" | "next" | "search" | "send";
  mono?: boolean;
  style?: object;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.text.muted}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      returnKeyType={returnKeyType}
      style={[
        mono ? { fontFamily: "JetBrainsMono_500Medium" } : fontStyle("regular"),
        {
          minHeight: 46,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: radius.input,
          borderWidth: 1,
          borderColor: colors.border.card,
          backgroundColor: colors.surface.input,
          color: colors.text.primary,
          fontSize: 15,
          lineHeight: 20,
        },
        style,
      ]}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// POSITION GROUP + CHIP
// ──────────────────────────────────────────────────────────────────────

function PositionGroup({
  sideLabel,
  side,
  positions,
  primary,
  secondary,
  onPrimary,
  onSecondary,
}: {
  sideLabel: string;
  side: Side;
  positions: { id: string; label: string }[];
  primary: string | null;
  secondary: string[];
  onPrimary: (id: string) => void;
  onSecondary: (id: string) => void;
}) {
  return (
    <View>
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10,
            fontWeight: fontWeight.bold,
            color: sideAccent(side),
            letterSpacing: tracking.loose,
            textTransform: "uppercase",
            marginBottom: 8,
            opacity: 0.85,
          },
        ]}
      >
        {sideLabel}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {positions.map((p) => (
          <PosChip
            key={p.id}
            label={p.label}
            id={p.id}
            isPrimary={primary === p.id}
            isSecondary={secondary.includes(p.id)}
            onPrimary={() => onPrimary(p.id)}
            onSecondary={() => onSecondary(p.id)}
          />
        ))}
      </View>
    </View>
  );
}

function CaptainToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      activeOpacity={0.85}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel="Mark as captain"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: radius.input,
        borderWidth: 1,
        borderColor: value ? colors.orange[500] : colors.border.card,
        backgroundColor: value
          ? colors.orange.tint
          : colors.surface.input,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: value
            ? colors.orange[500]
            : colors.surface.overlay,
        }}
      >
        <Ionicons
          name="star"
          size={16}
          color={value ? colors.text.primary : colors.text.muted}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 14,
              fontWeight: fontWeight.bold,
              color: colors.text.primary,
            },
          ]}
        >
          Team captain
        </Text>
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 12,
              color: colors.text.muted,
              marginTop: 2,
            },
          ]}
        >
          {value
            ? "Shows a CAPTAIN tag on the player's card."
            : "Tap to mark this player as a captain."}
        </Text>
      </View>
      <View
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          backgroundColor: value
            ? colors.orange[500]
            : colors.surface.overlay,
          padding: 3,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: colors.text.primary,
            alignSelf: value ? "flex-end" : "flex-start",
          }}
        />
      </View>
    </TouchableOpacity>
  );
}

function PosChip({
  label,
  id,
  isPrimary,
  isSecondary,
  onPrimary,
  onSecondary,
}: {
  label: string;
  id: string;
  isPrimary: boolean;
  isSecondary: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const accent = positionColor(id);
  const bg = isPrimary
    ? positionTint(id)
    : isSecondary
    ? `${accent}1A`
    : colors.surface.overlay;
  const borderColor =
    isPrimary || isSecondary ? accent : colors.border.default;
  const color = isPrimary
    ? accent
    : isSecondary
    ? accent
    : colors.text.secondary;

  return (
    <TouchableOpacity
      onPress={onPrimary}
      onLongPress={onSecondary}
      delayLongPress={250}
      activeOpacity={0.85}
      accessibilityLabel={`${label} ${isPrimary ? "primary position" : "select"}`}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {isPrimary ? (
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: accent,
          }}
        />
      ) : null}
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 13,
            fontWeight: fontWeight.bold,
            color,
            letterSpacing: 0.1,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
