import { View } from 'react-native';

import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import type { ScreenParams } from '@/navigation';
import { DetailAppBar, NotFoundScreen, screenTitle } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { LoadingState, Panel, Panels, Screen } from '@/ui';

import {
  GroupActions,
  GroupMenuButton,
  GroupNotices,
  GroupSettingsHost,
  GroupTabBody,
  GroupTabsBar,
  hasGroupNotices,
} from './detail/group-detail-parts';
import { GROUP_SIDE_TABS, GROUP_TABS, useGroupDetail } from './detail/use-group-detail';

/** Route params of `groups.detail` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type GroupDetailScreenProps = ScreenParams['groups.detail'];

/**
 * `groups.detail` (docs/spec/06-teacher-groups-calls-stats.md §1.2, §1.3; layout: docs/design/
 * glass-over-paper.md §7): one group of the teacher. Its parts — members (with the AI profile),
 * statistics, attendance, lessons — are never all open at once; rename and delete sit behind «⋯».
 *
 * Phone: the parts are a switch in the header, «Составить урок» is the screen's main button. Tablet: the
 * members have the left panel, the switch and the other three parts the right one, and the two actions
 * move into the header. (On a tablet the groups screen shows a group next to the list; this screen is
 * where a link from elsewhere lands.)
 */
export function GroupDetailScreen({ groupId }: GroupDetailScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const split = theme.tablet;
  const state = useGroupDetail(groupId, { split });
  const { data, group } = state;

  // A foreign or deleted group is indistinguishable from a missing one.
  if (state.missing) return <NotFoundScreen />;

  const header = (
    <DetailAppBar
      title={data ? data.group.name : dict.planner.groups.detail.kicker}
      backTitle={screenTitle('groups.list', m.shell.tabs)}
      right={data ? <GroupMenuButton state={state} variant="glass" /> : undefined}
      aside={data ? split ? <GroupActions groupId={groupId} /> : <GroupTabsBar state={state} tabs={GROUP_TABS} /> : undefined}
    />
  );
  const pending = isLoadFailed(group) ? (
    <LoadFailure query={group} testID="group-error" />
  ) : (
    <LoadingState variant="list" count={4} accessibilityLabel={m.common.a11y.loading} testID="group-loading" />
  );

  if (split && data) {
    return (
      <Screen testID="group-detail-screen" header={header} scroll={false} maxWidth="full">
        {hasGroupNotices(state) ? (
          <View style={styles.notices}>
            <GroupNotices state={state} />
          </View>
        ) : null}
        <Panels>
          <Panel edges weight={2} refreshing={state.refreshing} onRefresh={state.refresh} testID="group-members-panel">
            <GroupTabBody state={state} tab="members" />
          </Panel>
          <Panel edges
            weight={3}
            header={<GroupTabsBar state={state} tabs={GROUP_SIDE_TABS} />}
            refreshing={state.refreshing}
            onRefresh={state.refresh}
            testID="group-parts-panel"
          >
            <GroupTabBody state={state} tab={state.tab} />
          </Panel>
        </Panels>
        <GroupSettingsHost state={state} />
      </Screen>
    );
  }

  return (
    <Screen testID="group-detail-screen" header={header} onRefresh={state.refresh} refreshing={state.refreshing}>
      {data ? (
        <>
          <GroupNotices state={state} />
          <GroupActions groupId={groupId} stretch />
          <GroupTabBody state={state} tab={state.tab} />
          <GroupSettingsHost state={state} />
        </>
      ) : (
        pending
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  notices: { gap: t.space.sm },
}));
