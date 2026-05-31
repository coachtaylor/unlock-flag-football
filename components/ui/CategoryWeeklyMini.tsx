import { View, Text } from "react-native";
import { colors, fontWeight } from "../../constants/design";
import { MonoText } from "../../constants/typography";
import { CATEGORY_COLORS, type CategoryKey } from "../../constants/categories";

type Week = {
  week: string;
  // Display label for this column — e.g. "Wk 3". Caller computes it so the
  // chart can label by absolute team-week (Sunday-anchored) rather than the
  // chart's own relative position.
  label: string;
  counts: Record<CategoryKey, number>;
  isNow: boolean;
};

const VISIBLE_KEYS: CategoryKey[] = ["offense", "defense", "footwork", "routes"];

export function CategoryWeeklyMini({
  weeks,
  height = 56,
}: {
  weeks: Week[];
  height?: number;
}) {
  // Compute the max bar height across the window so bars are comparable
  // week-to-week. Floor at 1 so an empty trend still renders proportionally.
  const max = Math.max(
    1,
    ...weeks.map((w) =>
      VISIBLE_KEYS.reduce((acc, k) => acc + (w.counts[k] ?? 0), 0)
    )
  );

  return (
    <View style={{ flexDirection: "column", gap: 6 }}>
      <View
        style={{
          flexDirection: "row",
          gap: 6,
          alignItems: "flex-end",
          height,
        }}
      >
        {weeks.map((w, i) => {
          const total = VISIBLE_KEYS.reduce(
            (acc, k) => acc + (w.counts[k] ?? 0),
            0
          );
          const pct = total / max;
          return (
            <View
              key={`${w.week}-${i}`}
              style={{
                flex: 1,
                height: "100%",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              <View
                style={{
                  width: "100%",
                  maxWidth: 22,
                  height: `${pct * 100}%`,
                  flexDirection: "column-reverse",
                  borderRadius: 3,
                  overflow: "hidden",
                  opacity: w.isNow ? 1 : 0.85,
                  borderWidth: w.isNow ? 1.5 : 0,
                  borderColor: w.isNow
                    ? "rgba(255,255,255,0.15)"
                    : "transparent",
                  backgroundColor: colors.border.strong,
                }}
              >
                {VISIBLE_KEYS.map((k) => {
                  const segPct =
                    total === 0 ? 0 : (w.counts[k] ?? 0) / total;
                  if (segPct === 0) return null;
                  return (
                    <View
                      key={k}
                      style={{
                        flexGrow: segPct,
                        flexShrink: 0,
                        backgroundColor: CATEGORY_COLORS[k],
                      }}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {weeks.map((w, i) => (
          <View
            key={`label-${w.week}-${i}`}
            style={{ flex: 1, alignItems: "center" }}
          >
            <MonoText
              weight={w.isNow ? "bold" : "medium"}
              style={{
                fontSize: 9,
                color: w.isNow ? colors.text.primary : colors.text.muted,
                fontWeight: w.isNow ? fontWeight.bold : fontWeight.medium,
              }}
            >
              {w.label}
            </MonoText>
          </View>
        ))}
      </View>
      <CategoryLegend />
    </View>
  );
}

function CategoryLegend() {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginTop: 4,
      }}
    >
      {VISIBLE_KEYS.map((k) => (
        <View
          key={k}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: CATEGORY_COLORS[k],
            }}
          />
          <Text
            style={{
              fontSize: 10,
              color: colors.text.muted,
              textTransform: "capitalize",
            }}
          >
            {k}
          </Text>
        </View>
      ))}
    </View>
  );
}
