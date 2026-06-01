import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing } from "../../constants/design";
import { fontStyle } from "../../constants/typography";
import { SheetContainer, SheetSectionLabel } from "../ui/Sheet";
import {
  loadEntityHistory,
  type ActivityEntityType,
  type ActivityFeedItem,
} from "../../lib/activity";

// History-on-tap (Build 14.5) — mobile mirror of the web EntityHistory modal.
// A small underlined trigger that opens a bottom sheet listing the full
// create→edit→finalize→… trail for one entity, newest first. Loads lazily on
// open (RLS scopes it to the user's team). Renders nothing if the trail is empty.
export function EntityHistorySheet({
  entityType,
  entityId,
  label = "View full history",
}: {
  entityType: ActivityEntityType;
  entityId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ActivityFeedItem[] | null>(null);

  async function openSheet() {
    setOpen(true);
    if (items === null && !loading) {
      setLoading(true);
      const rows = await loadEntityHistory(entityType, entityId);
      setItems(rows);
      setLoading(false);
    }
  }

  return (
    <>
      <TouchableOpacity onPress={openSheet} activeOpacity={0.7} hitSlop={8}>
        <Text
          style={[
            fontStyle("medium"),
            {
              fontSize: 12,
              color: colors.orange[400],
              textDecorationLine: "underline",
            },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>

      <SheetContainer open={open} onClose={() => setOpen(false)}>
        <SheetSectionLabel>History</SheetSectionLabel>
        {loading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
            <ActivityIndicator color={colors.orange[400]} />
          </View>
        ) : !items || items.length === 0 ? (
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 13, color: colors.text.secondary, paddingVertical: spacing.md },
            ]}
          >
            No history recorded yet.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
            {items.map((e, i) => (
              <View
                key={e.id}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: spacing.md,
                  paddingVertical: 12,
                  borderBottomWidth: i < items.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border.subtle,
                }}
              >
                <Text
                  style={[fontStyle("regular"), { flex: 1, fontSize: 13, color: colors.text.primary }]}
                >
                  <Text style={{ color: colors.text.primary }}>{e.who} </Text>
                  <Text style={{ color: colors.text.secondary }}>{e.verbLabel} </Text>
                  <Text style={{ color: colors.text.primary }}>{e.what}</Text>
                </Text>
                <Text
                  style={[
                    fontStyle("regular"),
                    { fontSize: 11, color: colors.text.muted, marginLeft: spacing.sm },
                  ]}
                >
                  {e.when}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </SheetContainer>
    </>
  );
}
