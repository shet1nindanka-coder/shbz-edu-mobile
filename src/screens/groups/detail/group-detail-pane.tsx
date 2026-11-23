import { View } from 'react-native';

import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { EmptyState, LoadingState, Text } from '@/ui';

import { ScrollPanel } from '../shared/scroll-panel';
import { GroupActions, GroupMenuButton, GroupNotices, GroupSettingsHost, GroupTabBody, GroupTabsBar } from './group-detail-parts';
import { GROUP_TABS, useGroupDetail } from './use-group-detail';

export type GroupDetailPaneProps = {
  groupId: string;
  weight?: number;
  /** The group is gone (deleted here, or found missing): the list gives the panel to another group. */
  onGone: () => void;
};

/**
 * The right panel of the groups screen on a tablet (mockup `T-groups`): the selected group — its name
 * and «⋯», the switch of its parts, then the part itself. What a phone opens as a pushed screen.
 */
export function GroupDetailPane({ groupId, weight, onGone }: GroupDetailPaneProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const state = useGroupDetail(groupId, { onGone });
  const { data, group } = state;

  return (
    <ScrollPanel
      weight={weight}
      refreshing={state.refreshing}
      onRefresh={state.refresh}
      header={
        data ? (
          <View style={styles.head}>
            <View style={styles.titleRow}>
              <Text variant="sectionTitle" accessibilityRole="header" numberOfLines={2} style={styles.title}>
                {data.group.name}
              </Text>
              <GroupMenuButton state={state} />
            </View>
            <GroupTabsBar state={state} tabs={GROUP_TABS} />
          </View>
        ) : undefined
      }
      contentStyle={styles.content}
      testID="group-detail-pane"
    >
      {data ? (
        <>
          <GroupNotices state={state} />
          <GroupActions groupId={groupId} />
          <GroupTabBody state={state} tab={state.tab} />
          <GroupSettingsHost state={state} />
        </>
      ) : state.missing ? (
        // A foreign or deleted group is indistinguishable from a missing one.
        <EmptyState variant="plain" title={dict.planner.groups.list.notices.missing} testID="group-missing" />
      ) : isLoadFailed(group) ? (
        <LoadFailure query={group} testID="group-error" />
      ) : (
        <LoadingState variant="list" count={4} accessibilityLabel={m.common.a11y.loading} testID="group-loading" />
      )}
    </ScrollPanel>
  );
}

const useStyles = makeStyles((t) => ({
  head: { gap: t.space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  title: { flex: 1, minWidth: 0 },
  content: { gap: t.space.block },
}));
