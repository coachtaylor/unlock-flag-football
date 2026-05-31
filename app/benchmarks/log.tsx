import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BENCHMARK_TYPE_META,
  DEFAULT_ATTEMPTS_PER_SET,
  type BenchmarkConfig,
  type BenchmarkType,
} from "../../constants/benchmarks";
import { colors, fontFamily, radius, spacing } from "../../constants/design";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { useTeam } from "../../lib/team-context";
import {
  buildSavePayload,
  buildStops,
  CaptureMap,
  CapturedSet,
  DEFAULT_SETS_PER_PLAYER,
  effectiveInverse,
  filterPlayersByGroup,
  groupsForScope,
  initialsFor,
  perTypeFor,
  resolveConfig,
  setKey,
  Stop,
  toneForGroup,
  toneColor,
  type GroupName,
  type SessionPlayer,
  type Tone,
  typesForGroup,
} from "../../lib/benchmark-session";
import { playerColorForIndex } from "../../lib/athlete";
import {
  CaptureFooter,
  CaptureShell,
  PlayerBanner,
  QueueItem,
} from "../../components/benchmark/CaptureShell";
import {
  AttemptGrid,
  AttemptState,
  Counter,
  DirectionPill,
  ManualTimeInput,
  ObservationRow,
  RatingRow,
  Stopwatch,
} from "../../components/benchmark/CaptureWidgets";

type AttemptMap = Record<string, AttemptState[]>; // setKey → attempts

const todayString = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

// Tap-to-insert chips for the observation modal. Match the canonical list
// from the legacy benchmark log so the dashboard's tag analytics keep
// counting consistent phrases.
const QUICK_NOTES = [
  "Good hands",
  "Quick feet",
  "Needs footwork help",
  "Sharp routes",
  "Slow reaction",
  "Strong arm",
  "Good vision",
];

const formatStat = (
  type: BenchmarkType,
  set: CapturedSet | undefined
): string => {
  if (!set) return "—";
  switch (type) {
    case "timed":
      return set.timeSeconds != null ? set.timeSeconds.toFixed(2) : "—";
    case "rated":
      return set.rating != null ? `${set.rating}/5` : "—";
    case "pct":
      if (
        set.madeCount != null &&
        set.attemptsCount != null &&
        set.attemptsCount > 0
      ) {
        return `${set.madeCount}/${set.attemptsCount}`;
      }
      return "—";
    case "reps":
    case "flags":
    case "drops":
      return set.madeCount != null ? `${set.madeCount}` : "—";
  }
};

export default function BenchmarkLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { teamId } = useTeam();
  const params = useLocalSearchParams<{
    drill?: string;
    players?: string;
    sets?: string;
  }>();
  const drillId = params.drill ?? "";
  const playerIdsStr = params.players ?? "";
  const setsParam = Number(params.sets ?? DEFAULT_SETS_PER_PLAYER);
  const initialSetsPerPlayer =
    Number.isFinite(setsParam) && setsParam > 0
      ? Math.floor(setsParam)
      : DEFAULT_SETS_PER_PLAYER;

  const playerIds = useMemo(
    () => (playerIdsStr ? playerIdsStr.split(",").filter(Boolean) : []),
    [playerIdsStr]
  );

  const [loading, setLoading] = useState(true);
  const [drillName, setDrillName] = useState("");
  const [config, setConfig] = useState<BenchmarkConfig | null>(null);
  const [allPlayers, setAllPlayers] = useState<SessionPlayer[]>([]);
  const [captureMap, setCaptureMap] = useState<CaptureMap>({});
  const [attemptMap, setAttemptMap] = useState<AttemptMap>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Sets is mutable mid-flow so coaches can extend a session on the fly
  // (e.g., "give them one more rep"). Bumping never overwrites existing
  // saved sets — it just appends new stops.
  const [setsPerPlayer, setSetsPerPlayer] = useState(initialSetsPerPlayer);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stopIndex, setStopIndex] = useState(0);
  const [runningType, setRunningType] = useState<BenchmarkType | null>(null);
  const [noteOpenForPlayerId, setNoteOpenForPlayerId] = useState<string | null>(
    null
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [manualTimeOpen, setManualTimeOpen] = useState(false);

  // Tracks whether we've already auto-jumped to the first incomplete stop
  // on initial mount so subsequent stops state changes don't override the
  // user's manual navigation.
  const initialJumpDoneRef = useRef(false);

  // Load drill + roster + hydrate any sets already saved today
  useEffect(() => {
    let cancelled = false;
    if (!drillId || playerIds.length === 0 || !teamId) {
      setLoading(false);
      return;
    }

    (async () => {
      const today = todayString();
      const [drillRes, playersRes, existingRes] = await Promise.all([
        supabase
          .from("team_drills")
          .select(
            "id, drill_name, benchmark_type, benchmark_types, benchmark_config"
          )
          .eq("id", drillId)
          .maybeSingle(),
        (async (): Promise<{
          data: any[] | null;
          error: { message: string } | null;
        }> => {
          // Try with color_index (migration 45); fall back without it.
          const sel = (withColor: boolean) =>
            supabase
              .from("team_players")
              .select(
                `id, player_name, positions${withColor ? ", color_index" : ""}`
              )
              .in("id", playerIds);
          let res = await sel(true);
          if (res.error && /color_index/i.test(res.error.message)) {
            res = await sel(false);
          }
          return res;
        })(),
        // Pull anything already captured for these players on this drill today.
        // No assessed_by filter — if a co-captain logged earlier, we still
        // want the queue to show "done" so we don't overwrite their work.
        supabase
          .from("benchmark_results")
          .select(
            "player_id, benchmark_type, set_number, time_seconds, rating, made_count, attempts_count, inverse, notes"
          )
          .eq("team_id", teamId)
          .eq("drill_id", drillId)
          .eq("assessment_date", today)
          .in("player_id", playerIds),
      ]);

      if (cancelled) return;

      if (drillRes.data) {
        setDrillName(drillRes.data.drill_name as string);
        const cfg = resolveConfig(
          (drillRes.data as { benchmark_config?: unknown })
            .benchmark_config ?? null,
          ((drillRes.data as { benchmark_type?: string }).benchmark_type ??
            null) as string | null,
          ((drillRes.data as { benchmark_types?: string[] }).benchmark_types ??
            null) as string[] | null
        );
        setConfig(cfg);
      }

      const byId = new Map<string, SessionPlayer>();
      for (const p of playersRes.data ?? []) {
        const id = p.id as string;
        const name = p.player_name as string;
        byId.set(id, {
          id,
          name,
          positions: (p.positions as string[] | null) ?? [],
          initials: initialsFor(name),
          // Resolve from the player's stable color slot (migration 45).
          color: playerColorForIndex(p.color_index as number | null),
        });
      }
      const ordered: SessionPlayer[] = playerIds
        .map((id) => byId.get(id))
        .filter((p): p is SessionPlayer => !!p);

      // Hydrate captureMap + attemptMap from saved rows so the queue shows
      // "done", prior set chips render, and a re-entry lands at the next
      // incomplete stop.
      const initialCapture: CaptureMap = {};
      const initialAttempts: AttemptMap = {};
      const initialNotes: Record<string, string> = {};
      for (const r of existingRes.data ?? []) {
        const type = (r.benchmark_type as BenchmarkType | null) ?? null;
        const setNum = (r.set_number as number | null) ?? null;
        const playerId = r.player_id as string;
        if (!type || !setNum) continue;
        const k = setKey(playerId, type, setNum);
        const cap: CapturedSet = { savedAt: Date.now() };
        if (r.time_seconds != null) cap.timeSeconds = Number(r.time_seconds);
        if (r.rating != null) cap.rating = Number(r.rating);
        if (r.made_count != null) cap.madeCount = Number(r.made_count);
        if (r.attempts_count != null)
          cap.attemptsCount = Number(r.attempts_count);
        if (r.inverse != null) cap.inverse = Boolean(r.inverse);
        initialCapture[k] = cap;

        if (type === "pct" && r.attempts_count != null) {
          const made = Number(r.made_count ?? 0);
          const attempts = Number(r.attempts_count);
          const grid: AttemptState[] = [];
          for (let i = 0; i < attempts; i++) {
            grid.push(i < made ? "made" : "miss");
          }
          initialAttempts[k] = grid;
        }

        if (r.notes && typeof r.notes === "string" && !initialNotes[playerId]) {
          initialNotes[playerId] = r.notes;
        }
      }

      setAllPlayers(ordered);
      setCaptureMap(initialCapture);
      setAttemptMap(initialAttempts);
      setNotes(initialNotes);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [drillId, playerIds, teamId]);

  const groups: GroupName[] = useMemo(
    () => (config ? groupsForScope(config.scope) : []),
    [config]
  );

  const playersByGroup = useMemo(() => {
    const out: Record<GroupName, SessionPlayer[]> = {
      whole: [],
      qb: [],
      nonqb: [],
    };
    for (const g of groups) {
      out[g] = filterPlayersByGroup(allPlayers, g);
    }
    return out;
  }, [groups, allPlayers]);

  const stops: Stop[] = useMemo(() => {
    if (!config) return [];
    return buildStops(config, groups, playersByGroup, setsPerPlayer);
  }, [config, groups, playersByGroup, setsPerPlayer]);

  // One-shot: after initial hydration, land on the first stop that isn't
  // fully saved. If everything's already captured, stays at the last stop.
  useEffect(() => {
    if (initialJumpDoneRef.current) return;
    if (loading || stops.length === 0 || !config) return;
    let firstIncomplete = -1;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const types = typesForGroup(config, s.group);
      let allSaved = types.length > 0;
      for (const t of types) {
        const cap = captureMap[setKey(s.playerId, t, s.setNumber)];
        if (!cap?.savedAt) {
          allSaved = false;
          break;
        }
      }
      if (!allSaved) {
        firstIncomplete = i;
        break;
      }
    }
    if (firstIncomplete >= 0 && firstIncomplete !== stopIndex) {
      setStopIndex(firstIncomplete);
    }
    initialJumpDoneRef.current = true;
  }, [loading, stops, config, captureMap, stopIndex]);

  const currentStop: Stop | null = stops[stopIndex] ?? null;
  const currentPlayer = useMemo(() => {
    if (!currentStop) return null;
    return allPlayers.find((p) => p.id === currentStop.playerId) ?? null;
  }, [currentStop, allPlayers]);

  const typesForCurrent = useMemo(() => {
    if (!config || !currentStop) return [] as BenchmarkType[];
    return typesForGroup(config, currentStop.group);
  }, [config, currentStop]);

  // Reset transient widget state when moving stops
  useEffect(() => {
    setRunningType(null);
    setManualTimeOpen(false);
    setError(null);
  }, [stopIndex]);

  // Init pct attempt grids lazily when this stop's pct types come up
  useEffect(() => {
    if (!currentStop) return;
    for (const t of typesForCurrent) {
      if (t !== "pct") continue;
      const pt = perTypeFor(config!, currentStop.group, t);
      const attemptsCount =
        pt.attemptsPerSet && pt.attemptsPerSet > 0
          ? pt.attemptsPerSet
          : DEFAULT_ATTEMPTS_PER_SET;
      const k = setKey(currentStop.playerId, t, currentStop.setNumber);
      if (attemptMap[k]) continue;
      setAttemptMap((prev) => ({
        ...prev,
        [k]: Array.from(
          { length: attemptsCount },
          () => "pending" as AttemptState
        ),
      }));
    }
  }, [currentStop, typesForCurrent, attemptMap, config]);

  // ── Updaters ──────────────────────────────────────────────────────
  const patchSet = useCallback(
    (type: BenchmarkType, patch: Partial<CapturedSet>) => {
      if (!currentStop) return;
      const k = setKey(currentStop.playerId, type, currentStop.setNumber);
      setCaptureMap((prev) => ({
        ...prev,
        [k]: { ...(prev[k] ?? {}), ...patch },
      }));
    },
    [currentStop]
  );

  const tapAttempt = useCallback(
    (i: number) => {
      if (!currentStop) return;
      const t: BenchmarkType = "pct";
      const k = setKey(currentStop.playerId, t, currentStop.setNumber);
      setAttemptMap((prev) => {
        const arr =
          prev[k] ??
          Array.from(
            { length: DEFAULT_ATTEMPTS_PER_SET },
            () => "pending" as AttemptState
          );
        const next = arr.slice();
        next[i] =
          arr[i] === "pending"
            ? "made"
            : arr[i] === "made"
            ? "miss"
            : "pending";
        const made = next.filter((a) => a === "made").length;
        const attempted = next.filter((a) => a !== "pending").length;
        setCaptureMap((cm) => ({
          ...cm,
          [k]: {
            ...(cm[k] ?? {}),
            madeCount: made,
            attemptsCount: attempted,
          },
        }));
        return { ...prev, [k]: next };
      });
    },
    [currentStop]
  );

  // ── PB / last lookup (in-session only) ────────────────────────────
  const playerBestForType = useCallback(
    (playerId: string, type: BenchmarkType) => {
      let pb: number | null = null;
      let last: number | null = null;
      let lastSet = -1;
      for (const s of stops) {
        if (s.playerId !== playerId) continue;
        const k = setKey(playerId, type, s.setNumber);
        const cap = captureMap[k];
        if (!cap) continue;
        const val =
          type === "timed"
            ? cap.timeSeconds
            : type === "rated"
            ? cap.rating
            : cap.madeCount;
        if (val == null) continue;
        if (s.setNumber > lastSet) {
          last = val;
          lastSet = s.setNumber;
        }
        if (pb == null) pb = val;
        else if (type === "timed") pb = Math.min(pb, val);
        else if (type === "drops") pb = Math.min(pb, val);
        else pb = Math.max(pb, val);
      }
      return { pb, last };
    },
    [captureMap, stops]
  );

  // ── Save current set (writes one row per type) + advance ─────────
  const saveCurrent = useCallback(async (): Promise<boolean> => {
    if (!currentStop || !currentPlayer || !config || !user || !teamId) {
      setError("Missing context. Go back and try again.");
      return false;
    }

    setSaving(true);
    setError(null);
    const date = todayString();

    // Build payloads for every type configured for this group; skip empty ones.
    const payloads: { type: BenchmarkType; payload: ReturnType<typeof buildSavePayload> }[] = [];
    for (const t of typesForCurrent) {
      const pt = perTypeFor(config, currentStop.group, t);
      const cap = captureMap[setKey(currentStop.playerId, t, currentStop.setNumber)] ?? {};
      const payload = buildSavePayload(
        t,
        currentStop.setNumber,
        currentStop.group,
        cap,
        pt
      );
      if (payload) payloads.push({ type: t, payload });
    }

    if (payloads.length === 0) {
      setSaving(false);
      setError("Enter a value for at least one metric.");
      return false;
    }

    // Upsert each (player, drill, date, type, set) row.
    for (const { payload } of payloads) {
      if (!payload) continue;
      const { data: existing, error: lookupErr } = await supabase
        .from("benchmark_results")
        .select("id")
        .eq("team_id", teamId)
        .eq("drill_id", drillId)
        .eq("player_id", currentStop.playerId)
        .eq("assessed_by", user.id)
        .eq("assessment_date", date)
        .eq("benchmark_type", payload.benchmark_type)
        .eq("set_number", payload.set_number)
        .maybeSingle();

      if (lookupErr) {
        setSaving(false);
        setError(lookupErr.message);
        return false;
      }

      const row = {
        team_id: teamId,
        drill_id: drillId,
        player_id: currentStop.playerId,
        assessed_by: user.id,
        assessment_date: date,
        time_seconds: payload.time_seconds,
        rating: payload.rating,
        tags: [] as string[],
        notes: notes[currentStop.playerId]?.trim() || null,
        benchmark_type: payload.benchmark_type,
        set_number: payload.set_number,
        group_name: payload.group_name,
        made_count: payload.made_count,
        attempts_count: payload.attempts_count,
        inverse: payload.inverse,
        rated_label: payload.rated_label,
      };

      let writeErr: { message: string } | null = null;
      if (existing?.id) {
        const r = await supabase
          .from("benchmark_results")
          .update(row)
          .eq("id", existing.id);
        writeErr = r.error;
      } else {
        const r = await supabase.from("benchmark_results").insert(row);
        writeErr = r.error;
      }
      if (writeErr) {
        setSaving(false);
        setError(writeErr.message);
        return false;
      }
    }

    // Mark each captured set as saved locally for "done" badges.
    setCaptureMap((prev) => {
      const next = { ...prev };
      for (const { type } of payloads) {
        const k = setKey(
          currentStop.playerId,
          type,
          currentStop.setNumber
        );
        next[k] = { ...(next[k] ?? {}), savedAt: Date.now() };
      }
      return next;
    });

    setSaving(false);
    return true;
  }, [
    currentStop,
    currentPlayer,
    config,
    user,
    teamId,
    drillId,
    captureMap,
    notes,
    typesForCurrent,
  ]);

  const goNext = useCallback(async () => {
    const ok = await saveCurrent();
    if (!ok) return;
    if (stopIndex >= stops.length - 1) {
      router.replace(
        `/benchmarks/complete?drill=${drillId}&players=${allPlayers.length}&sets=${setsPerPlayer}` as never
      );
      return;
    }
    setStopIndex((i) => i + 1);
  }, [
    saveCurrent,
    stopIndex,
    stops.length,
    router,
    drillId,
    allPlayers.length,
    setsPerPlayer,
  ]);

  const goSkip = useCallback(() => {
    if (stopIndex >= stops.length - 1) {
      router.replace(
        `/benchmarks/complete?drill=${drillId}&players=${allPlayers.length}&sets=${setsPerPlayer}` as never
      );
      return;
    }
    setStopIndex((i) => i + 1);
  }, [stopIndex, stops.length, router, drillId, allPlayers.length, setsPerPlayer]);

  const jumpToPlayer = useCallback(
    (playerId: string) => {
      if (!currentStop) return;
      const targetIdx = stops.findIndex(
        (s) => s.playerId === playerId && s.group === currentStop.group
      );
      if (targetIdx >= 0) setStopIndex(targetIdx);
    },
    [currentStop, stops]
  );

  const switchGroup = useCallback(() => {
    if (!currentStop || groups.length < 2) return;
    const otherGroup = groups.find((g) => g !== currentStop.group);
    if (!otherGroup) return;
    const idx = stops.findIndex((s) => s.group === otherGroup);
    if (idx >= 0) setStopIndex(idx);
  }, [currentStop, groups, stops]);

  // Jump to a specific set for the current player+group, without saving.
  // Used by the prior-set chips and the back-one-set arrow.
  const jumpToSet = useCallback(
    (setNumber: number) => {
      if (!currentStop) return;
      const idx = stops.findIndex(
        (s) =>
          s.group === currentStop.group &&
          s.playerId === currentStop.playerId &&
          s.setNumber === setNumber
      );
      if (idx >= 0) setStopIndex(idx);
    },
    [currentStop, stops]
  );

  // Step one stop backward (intra-player or cross-player). Doesn't save —
  // any pending in-memory values stick around in case the user wants them.
  const goPrev = useCallback(() => {
    if (stopIndex <= 0) return;
    setStopIndex((i) => i - 1);
  }, [stopIndex]);

  const canGoPrev = stopIndex > 0;

  // Append one extra set for every player. New stops get appended to the
  // end of the stops array; existing captured rows are untouched.
  const addSet = useCallback(() => {
    setSetsPerPlayer((n) => Math.min(n + 1, 20));
  }, []);

  // ── Queue ─────────────────────────────────────────────────────────
  const queueItems: QueueItem[] = useMemo(() => {
    if (!currentStop || !config) return [];
    const groupPlayers = playersByGroup[currentStop.group] ?? [];
    return groupPlayers.map((p) => {
      let state: QueueItem["state"] = "next";
      if (p.id === currentStop.playerId) state = "now";
      else {
        const types = typesForGroup(config, currentStop.group);
        let done = true;
        for (let s = 1; s <= setsPerPlayer; s++) {
          let savedAny = false;
          for (const t of types) {
            const cap = captureMap[setKey(p.id, t, s)];
            if (cap?.savedAt) {
              savedAny = true;
              break;
            }
          }
          if (!savedAny) {
            done = false;
            break;
          }
        }
        state = done ? "done" : "next";
      }

      let last = "—";
      if (state === "now") last = "NOW";
      else if (state === "done") last = "✓";
      else {
        const primary = typesForGroup(config, currentStop.group)[0];
        if (primary) {
          const { pb } = playerBestForType(p.id, primary);
          if (pb != null) {
            last = primary === "timed" ? pb.toFixed(2) : String(pb);
          }
        }
      }

      return {
        playerId: p.id,
        initials: p.initials,
        color: p.color,
        last,
        state,
      };
    });
  }, [
    currentStop,
    playersByGroup,
    config,
    setsPerPlayer,
    captureMap,
    playerBestForType,
  ]);

  const tone: Tone = currentStop ? toneForGroup(currentStop.group) : "orange";

  const accent = toneColor(tone);

  // ── Note modal ───────────────────────────────────────────────────
  const openNoteForCurrent = () => {
    if (!currentStop) return;
    setNoteOpenForPlayerId(currentStop.playerId);
    setNoteDraft(notes[currentStop.playerId] ?? "");
  };

  const saveNote = () => {
    if (!noteOpenForPlayerId) return;
    setNotes((prev) => ({ ...prev, [noteOpenForPlayerId]: noteDraft }));
    setNoteOpenForPlayerId(null);
  };

  if (
    loading ||
    !config ||
    !currentStop ||
    !currentPlayer ||
    stops.length === 0
  ) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading ? (
          <ActivityIndicator color={colors.orange[500]} />
        ) : (
          <View style={{ paddingHorizontal: spacing["2xl"], gap: spacing.lg }}>
            <Text
              style={{
                color: colors.text.primary,
                fontSize: 16,
                textAlign: "center",
                fontFamily: fontFamily.sansSemibold,
              }}
            >
              No capture configured for the selected players.
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.85}
              style={{
                alignSelf: "center",
                backgroundColor: colors.orange[500],
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: radius.xl,
              }}
            >
              <Text
                style={{
                  color: colors.text.onBrand,
                  fontFamily: fontFamily.sansBold,
                }}
              >
                Back
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  const groupLabel =
    currentStop.group === "qb"
      ? "QBs only"
      : currentStop.group === "nonqb"
      ? "Receivers / Non-QBs"
      : "Whole team";

  const playerRole =
    currentStop.group === "qb"
      ? "QB · ON THE FIELD"
      : currentStop.group === "nonqb"
      ? "RECEIVER · ON THE FIELD"
      : "ON THE FIELD";

  // Banner stats: show the first metric's PB/last as a teaser
  const primaryType = typesForCurrent[0];
  const bannerStats = (() => {
    if (!primaryType) return { pb: null as string | null, last: null as string | null };
    const { pb, last } = playerBestForType(currentStop.playerId, primaryType);
    const fmt = (v: number | null) => {
      if (v == null) return null;
      if (primaryType === "timed") return `${v.toFixed(2)}s`;
      return `${v}`;
    };
    return { pb: fmt(pb), last: fmt(last) };
  })();

  const queueRightLabel =
    groups.length > 1
      ? `tap to switch ⇄`
      : (() => {
          const players = playersByGroup[currentStop.group] ?? [];
          const done = players.filter((p) => {
            const types = typesForGroup(config, currentStop.group);
            for (let s = 1; s <= setsPerPlayer; s++) {
              let savedAny = false;
              for (const t of types) {
                if (captureMap[setKey(p.id, t, s)]?.savedAt) {
                  savedAny = true;
                  break;
                }
              }
              if (!savedAny) return false;
            }
            return true;
          }).length;
          return `${done} of ${players.length} done`;
        })();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <CaptureShell
        topLabel={`CAPTURING · SET ${currentStop.setNumber} of ${setsPerPlayer}`}
        topTone={tone}
        onBack={() => router.back()}
        onClose={() => router.back()}
        queueLeft={`${groupLabel} · up next`}
        queueRight={queueRightLabel}
        onQueueRightPress={groups.length > 1 ? switchGroup : undefined}
        queue={queueItems}
        onQueueTap={jumpToPlayer}
        topPaddingInset={insets.top}
        banner={
          <PlayerBanner
            player={currentPlayer}
            role={playerRole}
            setIndex={currentStop.setNumber}
            setTotal={setsPerPlayer}
            pb={bannerStats.pb}
            last={bannerStats.last}
            tone={tone}
          />
        }
        footer={
          <CaptureFooter
            tone={tone}
            secondary="Skip set"
            primary={stopIndex >= stops.length - 1 ? "Finish" : "Save set · next"}
            onSecondary={goSkip}
            onPrimary={goNext}
            saving={saving}
            bottomInset={insets.bottom}
          />
        }
      >
        {/* One card per type — stacked */}
        {typesForCurrent.map((type) => {
          const pt = perTypeFor(config, currentStop.group, type);
          const meta = BENCHMARK_TYPE_META[type];
          const isInverse = effectiveInverse(type, pt);
          const k = setKey(currentStop.playerId, type, currentStop.setNumber);
          const cap = captureMap[k] ?? {};
          const attemptsCount =
            pt.attemptsPerSet && pt.attemptsPerSet > 0
              ? pt.attemptsPerSet
              : DEFAULT_ATTEMPTS_PER_SET;

          return (
            <View
              key={type}
              style={{
                backgroundColor: isInverse
                  ? "rgba(255, 77, 77, 0.04)"
                  : colors.surface.raised,
                borderWidth: 1,
                borderColor: isInverse
                  ? "rgba(255, 77, 77, 0.22)"
                  : colors.border.card,
                borderRadius: radius.card,
                padding: spacing.lg,
                marginBottom: 12,
              }}
            >
              {/* Metric label row */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: spacing.md,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      backgroundColor: colors.surface.overlay,
                      borderWidth: 1,
                      borderColor: colors.border.card,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name={meta.icon} size={14} color={accent} />
                  </View>
                  <View style={{ gap: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        letterSpacing: 0.4,
                        color: colors.text.primary,
                        fontFamily: fontFamily.sansBold,
                      }}
                    >
                      {type === "rated" && pt.label ? pt.label : meta.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10.5,
                        color: colors.text.muted,
                        fontFamily: fontFamily.sansMedium,
                      }}
                    >
                      {meta.sub}
                    </Text>
                  </View>
                </View>
                {type === "rated" ? (
                  <DirectionPill kind="required" />
                ) : type === "timed" || isInverse ? (
                  <DirectionPill kind="lower" />
                ) : type === "pct" ? (
                  <DirectionPill kind="computed" />
                ) : (
                  <DirectionPill kind="higher" />
                )}
              </View>

              {/* Widget */}
              {type === "timed" ? (
                <View style={{ gap: spacing.md }}>
                  {manualTimeOpen ? (
                    <ManualTimeInput
                      value={cap.timeSeconds ?? null}
                      onChange={(v) => patchSet("timed", { timeSeconds: v })}
                    />
                  ) : (
                    <Stopwatch
                      value={cap.timeSeconds ?? null}
                      onChange={(v) => patchSet("timed", { timeSeconds: v })}
                      running={runningType === "timed"}
                      onToggle={() =>
                        setRunningType((r) => (r === "timed" ? null : "timed"))
                      }
                    />
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      setRunningType(null);
                      setManualTimeOpen((v) => !v);
                    }}
                    activeOpacity={0.6}
                    style={{ alignSelf: "center" }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: colors.orange[400],
                        fontFamily: fontFamily.sansMedium,
                      }}
                    >
                      {manualTimeOpen ? "Use stopwatch" : "Type a time"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : type === "rated" ? (
                <RatingRow
                  value={cap.rating ?? null}
                  onChange={(v) => patchSet("rated", { rating: v })}
                  tone={tone === "blue" ? "blue" : "orange"}
                />
              ) : type === "pct" ? (
                <View style={{ gap: spacing.md }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      gap: spacing.sm,
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fontFamily.monoBold,
                        fontSize: 38,
                        color: colors.text.primary,
                        letterSpacing: -1,
                      }}
                    >
                      {cap.madeCount ?? 0}
                      <Text style={{ color: colors.text.muted }}>
                        /{attemptsCount}
                      </Text>
                    </Text>
                    <Text
                      style={{
                        fontFamily: fontFamily.monoBold,
                        fontSize: 14,
                        color: colors.lime[400],
                      }}
                    >
                      {(() => {
                        const grid = attemptMap[k] ?? [];
                        const attempted = grid.filter(
                          (a) => a !== "pending"
                        ).length;
                        if (attempted === 0) return "—";
                        const made = grid.filter((a) => a === "made").length;
                        return `${Math.round((made / attempted) * 100)}%`;
                      })()}
                    </Text>
                  </View>
                  <AttemptGrid
                    attempts={
                      attemptMap[k] ??
                      Array.from(
                        { length: attemptsCount },
                        () => "pending" as AttemptState
                      )
                    }
                    onTap={tapAttempt}
                  />
                </View>
              ) : (
                <Counter
                  value={cap.madeCount ?? 0}
                  onChange={(v) => patchSet(type, { madeCount: v })}
                  inverse={isInverse}
                  attempts={
                    pt.attemptsPerSet && type === "drops"
                      ? pt.attemptsPerSet
                      : null
                  }
                />
              )}

              {/* All-sets strip — every set in the player's flow, current
                  highlighted, others tappable. Per-metric so the value
                  preview reflects this metric, not a combined readout. */}
              {(
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 6,
                    justifyContent: "center",
                    marginTop: spacing.md,
                  }}
                >
                  {Array.from({ length: setsPerPlayer }).map((_, i) => {
                    const setNum = i + 1;
                    const pk = setKey(
                      currentStop.playerId,
                      type,
                      setNum
                    );
                    const pcap = captureMap[pk];
                    const isCurrent = setNum === currentStop.setNumber;
                    const hasValue = formatStat(type, pcap) !== "—";
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => jumpToSet(setNum)}
                        disabled={isCurrent}
                        activeOpacity={0.7}
                        accessibilityLabel={`Go to set ${setNum}`}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 999,
                          backgroundColor: isCurrent
                            ? colors.orange.tint
                            : colors.surface.overlay,
                          borderWidth: 1,
                          borderColor: isCurrent
                            ? colors.orange[500]
                            : colors.border.card,
                        }}
                      >
                        {!isCurrent && hasValue ? (
                          <Ionicons
                            name="pencil"
                            size={10}
                            color={colors.text.muted}
                          />
                        ) : null}
                        <Text
                          style={{
                            fontSize: 11,
                            fontFamily: fontFamily.mono,
                            color: isCurrent
                              ? colors.orange[400]
                              : colors.text.primary,
                          }}
                        >
                          S{setNum}
                          {isCurrent
                            ? ` · NOW`
                            : `: ${formatStat(type, pcap)}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    onPress={addSet}
                    activeOpacity={0.7}
                    accessibilityLabel="Add another set"
                    disabled={setsPerPlayer >= 20}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: colors.border.dashed,
                      opacity: setsPerPlayer >= 20 ? 0.4 : 1,
                    }}
                  >
                    <Ionicons
                      name="add"
                      size={11}
                      color={colors.orange[400]}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: fontFamily.sansBold,
                        color: colors.orange[400],
                      }}
                    >
                      Add set
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Observation row */}
        <ObservationRow
          onPress={openNoteForCurrent}
          hasNote={!!notes[currentStop.playerId]}
          style={{ marginBottom: 12 }}
        />

        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: spacing.md,
            marginBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={goPrev}
            disabled={!canGoPrev}
            activeOpacity={0.6}
            hitSlop={8}
            accessibilityLabel="Previous stop"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: canGoPrev
                ? colors.border.card
                : colors.border.subtle,
              backgroundColor: colors.surface.overlay,
              opacity: canGoPrev ? 1 : 0.4,
            }}
          >
            <Ionicons
              name="chevron-back"
              size={12}
              color={colors.text.secondary}
            />
            <Text
              style={{
                fontSize: 11,
                color: colors.text.secondary,
                fontFamily: fontFamily.sansSemibold,
              }}
            >
              Prev
            </Text>
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 11,
              color: colors.text.muted,
              fontFamily: fontFamily.sansMedium,
            }}
          >
            Stop {stopIndex + 1} of {stops.length}
          </Text>
        </View>

        {error ? (
          <Text
            style={{
              fontSize: 12,
              color: colors.errorLight,
              textAlign: "center",
              marginBottom: 12,
              fontFamily: fontFamily.sansMedium,
            }}
          >
            {error}
          </Text>
        ) : null}
      </CaptureShell>

      {/* Observation modal */}
      <Modal
        visible={!!noteOpenForPlayerId}
        animationType="slide"
        transparent
        onRequestClose={() => setNoteOpenForPlayerId(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.scrim,
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface.base,
              borderTopLeftRadius: radius.card,
              borderTopRightRadius: radius.card,
              padding: spacing.xl,
              paddingBottom: insets.bottom + spacing.xl,
              gap: spacing.md,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: fontFamily.sansBold,
                  color: colors.text.primary,
                }}
              >
                Observation for {currentPlayer.name.split(" ")[0]}
              </Text>
              <TouchableOpacity
                onPress={() => setNoteOpenForPlayerId(null)}
                hitSlop={10}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            </View>
            {/* Quick-tap chips — tap to insert / toggle */}
            <View style={{ gap: spacing.xs }}>
              <Text
                style={{
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: colors.text.subtle,
                  fontFamily: fontFamily.sansBold,
                }}
              >
                Quick notes
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {QUICK_NOTES.map((tag) => {
                  const present = noteDraft
                    .toLowerCase()
                    .includes(tag.toLowerCase());
                  return (
                    <TouchableOpacity
                      key={tag}
                      onPress={() => {
                        if (present) {
                          // Remove the tag (and a trailing separator if any)
                          const re = new RegExp(
                            `\\s*${tag.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*[,.;·]?\\s*`,
                            "i"
                          );
                          setNoteDraft((d) => d.replace(re, " ").trim());
                        } else {
                          setNoteDraft((d) =>
                            d.trim().length > 0 ? `${d.trim()}, ${tag}` : tag
                          );
                        }
                      }}
                      activeOpacity={0.75}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: radius.pill,
                        backgroundColor: present
                          ? colors.orange.tint
                          : colors.surface.raised,
                        borderWidth: 1,
                        borderColor: present
                          ? colors.orange.tintBorder
                          : colors.border.card,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: fontFamily.sansSemibold,
                          color: present
                            ? colors.orange[400]
                            : colors.text.secondary,
                        }}
                      >
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="Or write your own…"
              placeholderTextColor={colors.text.muted}
              multiline
              style={{
                minHeight: 100,
                backgroundColor: colors.surface.raised,
                borderWidth: 1,
                borderColor: colors.border.card,
                borderRadius: radius.lg,
                padding: spacing.md,
                color: colors.text.primary,
                fontFamily: fontFamily.sans,
                fontSize: 14,
                textAlignVertical: "top",
              }}
            />
            <TouchableOpacity
              onPress={saveNote}
              activeOpacity={0.85}
              style={{
                height: 48,
                borderRadius: radius.xl,
                backgroundColor: accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: fontFamily.sansBold,
                  color:
                    tone === "blue" ? "#062239" : colors.text.onBrand,
                }}
              >
                Save observation
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
