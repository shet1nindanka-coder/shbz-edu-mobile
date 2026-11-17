import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View, type ScrollViewInstance } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { DeveloperPanelTab } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { developerPanelTabs } from '@/domain/developer-panel-tabs';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, type ScreenParams } from '@/navigation';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles } from '@/theme';
import { Icon, LoadingState, Notice, PageHeader, PressableScale, Screen, Segmented, Text } from '@/ui';

import { ActionsTab } from './panel/actions-tab';
import { BroadcastTab } from './panel/broadcast-tab';
import { panelChips } from './panel/logic';
import { SettingsSaveBar, SettingsTab } from './panel/settings-tab';
import { StatusChips } from './panel/status-chips';
import { StatusTab } from './panel/status-tab';
import { useSettingsForm } from './panel/use-settings-form';

/** Route params of `developer.panel` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type DeveloperPanelScreenProps = ScreenParams['developer.panel'];

/** The journal link is one line of text: the slop brings its touch target to 44 pt. */
const JOURNAL_LINK_SLOP = { top: 13, bottom: 13, left: 12, right: 8 };

/**
 * `developer.panel` (docs/spec/07-developer-content.md §1.9): the developer's service panel — status,
 * service actions, broadcast and site settings — with the journal one tap away.
 *
 * The panel has neither a realtime event nor polling (07 §5): it is read on entry, on every return to the
 * screen, on pull-to-refresh and after each action. `tab` (a notification target, a web address) picks the
 * inner tab on arrival. A tab chosen by hand is written back to the route, so the route always names the
 * tab on screen and a later arrival at any tab — also the one of the previous arrival — shows that tab
 * (00 §3.3). Writing the param does not remount the screen: the forms keep what was typed.
 */
export function DeveloperPanelScreen({ tab }: DeveloperPanelScreenProps) {
  const styles = useStyles();
  const api = useApi();
  const navigation = useAppNavigation();
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel;
  const scrollRef = useRef<ScrollViewInstance>(null);

  const routeTab: DeveloperPanelTab = tab ?? 'status';
  // The local copy answers a tap at once; the route follows (see `selectTab`) and wins when it changes.
  const [active, setActive] = useState<DeveloperPanelTab>(routeTab);
  const [seenRouteTab, setSeenRouteTab] = useState(routeTab);
  if (seenRouteTab !== routeTab) {
    setSeenRouteTab(routeTab);
    setActive(routeTab);
  }

  const panel = useQuery({
    queryKey: qk('developer', 'getPanel'),
    queryFn: () => api.developer.getPanel(),
  });
  const data = panel.data;
  useRefetchOnFocus(panel.refetch);
  const form = useSettingsForm(data?.settings);

  const { refreshing, refresh } = usePullRefresh([panel]);

  const selectTab = (next: DeveloperPanelTab) => {
    setActive(next);
    // Same screen, new `tab` param: the panel is already the focused tab root, so this only updates the
    // route. Without it a second notification for the route's old tab would change nothing.
    if (next !== routeTab) navigation.open({ screen: 'developer.panel', tab: next });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <Screen
      testID="developer-panel-screen"
      header={<ShellAppBar title={screenTitle('developer.panel', m.shell.tabs)} />}
      bottomInset={false}
      scrollRef={scrollRef}
      onRefresh={refresh}
      refreshing={refreshing}
      footer={data && form && active === 'settings' ? <SettingsSaveBar form={form} /> : undefined}
    >
      <View style={styles.kickerRow}>
        <Text variant="kicker" style={styles.kicker}>
          {t.kicker}
        </Text>
        {/* The site's fifth item of the tab bar is a link, not a tab: the journal is a screen of its own
            (07 §1.9 layout item 2). Five segments do not fit a phone, so the link sits above the four tabs. */}
        <PressableScale
          accessibilityRole="link"
          accessibilityLabel={m.developer.panel.openJournal}
          onPress={() => navigation.push({ screen: 'developer.journal' })}
          hitSlop={JOURNAL_LINK_SLOP}
          scaleTo={1}
          style={styles.journal}
          pressedStyle={styles.journalPressed}
          testID="panel-open-journal"
        >
          <Text variant="link" color="accentSolid">
            {t.journal}
          </Text>
          <Icon name="chevronRight" size={16} color="accentSolid" />
        </PressableScale>
      </View>
      <PageHeader title={t.title} gap={0} />
      <View style={styles.body}>
        <Segmented<DeveloperPanelTab>
          options={developerPanelTabs(t.tabs).map((item) => ({ value: item.key, label: item.label }))}
          value={active}
          onChange={selectTab}
          accessibilityLabel={t.tabsAria}
          role="tab"
          plain
          // Four dictionary labels: shown in full on a 360-pt phone and with a large OS font (the bar
          // scrolls when they cannot fit), never ellipsized.
          scrollable
          testID="panel-tabs"
        />

        {data && form ? (
          <>
            <StatusChips chips={panelChips(data.stats, data.settings, t)} />
            {/* Cached values stay on screen when a refresh fails (offline): say so instead of replacing them. */}
            {panel.isError ? (
              <Notice tone="error" text={errorText(panel.error, m.developer.panel.refreshFailed)} testID="panel-refresh-error" />
            ) : null}
            {/* Every tab stays mounted: a half-written broadcast or an action result survives a tab switch. */}
            <View style={active === 'status' ? null : styles.hidden}>
              <StatusTab data={data} />
            </View>
            <View style={active === 'actions' ? null : styles.hidden}>
              <ActionsTab />
            </View>
            <View style={active === 'broadcast' ? null : styles.hidden}>
              <BroadcastTab students={data.students} />
            </View>
            <View style={active === 'settings' ? null : styles.hidden}>
              <SettingsTab form={form} />
            </View>
          </>
        ) : isLoadFailed(panel) ? (
          <LoadFailure query={panel} testID="panel-error" />
        ) : (
          <LoadingState variant="cards" count={3} cardHeight={132} accessibilityLabel={m.common.a11y.loading} testID="panel-loading" />
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  kickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md, marginBottom: 10 },
  kicker: { flexShrink: 1 },
  journal: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  journalPressed: { opacity: 0.6 },
  body: { gap: t.space.field, marginTop: t.space.lg },
  hidden: { display: 'none' },
}));
