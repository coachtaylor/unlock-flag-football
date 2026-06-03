import { withManageGuard } from "../../../components/RequireManage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlayerForm } from "../../../components/PlayerForm";
import { useTeam } from "../../../lib/team-context";

function NewPlayerScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();

  if (!teamId) return null;

  return <PlayerForm teamId={teamId} topInset={insets.top} />;
}

export default withManageGuard(NewPlayerScreen, "/roster");
