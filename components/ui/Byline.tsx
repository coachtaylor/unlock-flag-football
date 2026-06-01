import { Text, View } from "react-native";
import { colors } from "../../constants/design";
import { fontStyle } from "../../constants/typography";
import { formatActorTime } from "../../lib/date";

// Subtle attribution byline for detail screens (Build 14.5) — mobile mirror of
// unlock-web/src/components/activity/Byline.tsx. Presentational only; the
// caller resolves the actor name (via lib/activity resolveActorName). Renders
// nothing when there's no actor to credit.
//
// Collaborative artifacts (drills, practice plans) pass the LAST editor with
// verb="Updated" (falling back to creator + "Created" when never edited).
// Point-in-time records pass the author with the fitting verb.
export function Byline({
  who,
  verb = "Updated",
  at,
}: {
  who: string | null | undefined;
  verb?: string;
  at: string | null | undefined;
}) {
  if (!who) return null;
  const when = formatActorTime(at);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
      <Text style={[fontStyle("regular"), { fontSize: 12, color: colors.text.muted }]}>
        {verb} by{" "}
      </Text>
      <Text style={[fontStyle("medium"), { fontSize: 12, color: colors.text.secondary }]}>
        {who}
      </Text>
      {when ? (
        <Text style={[fontStyle("regular"), { fontSize: 12, color: colors.text.muted }]}>
          {"  ·  "}
          {when}
        </Text>
      ) : null}
    </View>
  );
}
