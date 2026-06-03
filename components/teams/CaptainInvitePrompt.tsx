// CaptainInvitePrompt — mobile mirror of the web prompt (Build 16.5). When a
// captain is saved with full or view-only access, offer to generate an invite
// link that grants exactly that access and links to their freshly-created
// player row (player_id) so redeeming doesn't create a duplicate player.
// A captain is always role 'captain'; view-only rides on captain_view_only
// (migration 90) so they're never stored as a team manager.

import { useState } from "react";
import {
  Modal,
  Pressable,
  Share,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import { createInvite, inviteLink } from "../../lib/team/invite-actions";

export function CaptainInvitePrompt({
  visible,
  teamId,
  playerId,
  playerName,
  access,
  onClose,
}: {
  visible: boolean;
  teamId: string;
  playerId: string;
  playerName: string;
  access: "full" | "view";
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const accessLabel = access === "full" ? "full access" : "view-only access";

  const generate = async () => {
    setError(null);
    setBusy(true);
    // A captain is always invited as role 'captain' — view-only rides on a
    // separate flag, so they're never stored as (or shown as) a team manager.
    const res = await createInvite({
      teamId,
      role: "captain",
      captainViewOnly: access === "view",
      playerId,
      expiresInDays: 14,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setToken(res.token);
  };

  const link = token ? inviteLink(token) : "";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: "center", padding: spacing.xl }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface.raised,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.border.card,
            padding: spacing.xl,
            gap: spacing.md,
          }}
        >
          <Text style={[fontStyle("bold"), { fontSize: 11, color: colors.orange[400], letterSpacing: 1, textTransform: "uppercase" }]}>
            Captain access
          </Text>
          <Text style={[fontStyle("bold"), { fontSize: 18, color: colors.text.primary }]}>
            {token ? "Invite link ready" : `Give ${playerName} ${accessLabel}?`}
          </Text>

          {token ? (
            <>
              <Text style={[fontStyle("regular"), { fontSize: 13, lineHeight: 19, color: colors.text.secondary }]}>
                Share this with {playerName}. It&rsquo;s linked to their roster spot and
                grants {accessLabel}. Works once.
              </Text>
              <View
                style={{
                  borderRadius: radius.input,
                  borderWidth: 1,
                  borderColor: colors.border.default,
                  backgroundColor: colors.surface.input,
                  padding: 12,
                }}
              >
                <MonoText weight="medium" selectable style={{ fontSize: 12, color: colors.text.primary }}>
                  {link}
                </MonoText>
              </View>
              <TouchableOpacity
                onPress={() => Share.share({ message: link })}
                activeOpacity={0.9}
                style={{ height: 50, borderRadius: 14, backgroundColor: colors.orange[500], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
              >
                <Ionicons name="share-outline" size={16} color={colors.text.primary} />
                <Text style={[fontStyle("bold"), { fontSize: 15, color: colors.text.primary }]}>Share link</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ alignItems: "center", paddingVertical: 6 }}>
                <Text style={[fontStyle("semibold"), { fontSize: 13, color: colors.text.secondary }]}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[fontStyle("regular"), { fontSize: 13, lineHeight: 19, color: colors.text.secondary }]}>
                {playerName} needs an account to log in with {accessLabel}. Generate an
                invite link to send them — or set it up later from the roster.
              </Text>
              {error ? (
                <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.errorLight }]}>{error}</Text>
              ) : null}
              <TouchableOpacity
                onPress={generate}
                disabled={busy}
                activeOpacity={0.9}
                style={{ height: 50, borderRadius: 14, backgroundColor: colors.orange[500], alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}
              >
                <Text style={[fontStyle("bold"), { fontSize: 15, color: colors.text.primary }]}>
                  {busy ? "Generating…" : "Generate invite link"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ alignItems: "center", paddingVertical: 6 }}>
                <Text style={[fontStyle("semibold"), { fontSize: 13, color: colors.text.secondary }]}>Later</Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
