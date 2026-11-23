import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View, useWindowDimensions, type ScrollViewInstance } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { DeveloperPanelTab } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { RetryWaitLine } from '@/components/retry-wait';
import { developerPanelTabs } from '@/domain/developer-panel-tabs';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, type ScreenParams } from '@/navigation';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { LoadingState, Notice, Screen, Segmented } from '@/ui';

import { ActionsTab } from './panel/actions-tab';
import { BroadcastTab } from './panel/broadcast-tab';
import { budgetRows, panelFigures } from './panel/logic';
import { SettingsSaveActions, SettingsSaveBar, SettingsStatusLine } from './panel/settings-save';
import { SettingsTab } from './panel/settings-tab';
import { StatusChips } from './panel/status-chips';
import { StatusTab } from './panel/status-tab';
import { useSettingsForm } from './panel/use-settings-form';

/** Route params of `developer.panel` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type DeveloperPanelScreenProps = ScreenParams['developer.panel'];

/** From this window width the five segments and the save button fit the header row next to the title. */
const ROOMY_HEADER_FROM = 1024;

/** The last segment of the header is not a tab of this screen: it opens the journal. */
const JOURNAL = 'journal';
type PanelSegment = DeveloperPanelTab | typeof JOURNAL;

/**
 * `developer.panel` (docs/spec/07-developer-content.md §1.9; layout: docs/design/glass-over-paper.md §7,
 * mockup D-panel): the developer's service panel — status, service actions, broadcast and site settings.
 * The segments of the panel are in the header; the fifth one, «Журнал», is a link as on the site: the
 * journal is a screen of its own (07 §1.9 layout item 2). A tablet lays every tab out as two panels down
 * to the dock and keeps «Сохранить настройки» in the header (on a narrow tablet — in the status row under
 * it); on a phone the header scrolls away with the long form, so the save bar is pinned above the dock.
 *
 * The panel has neither a realtime event nor polling (07 §5): it is read on entry, on every return to the
 * screen, on pull-to-refresh and after each action. `tab` (a notification target, a web address) picks the
 * inner tab on arrival. A tab chosen by hand is written back to the route, so the route always names the
 * tab on screen and a later arrival at any tab — also the one of the previous arrival — shows that tab
 * (00 §3.3). Writing the param does not remount the screen: the forms keep what was typed.
 */
export function DeveloperPanelScreen({ tab }: DeveloperPanelScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const window = useWindowDimensions();
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

  const selectTab = (next: PanelSegment) => {
    if (next === JOURNAL) {
      navigation.push({ screen: 'developer.journal' });
      return;
    }
    setActive(next);
    // Same screen, new `tab` param: the panel is already the focused tab root, so this only updates the
    // route. Without it a second notification for the route's old tab would change nothing.
    if (next !== routeTab) navigation.open({ screen: 'developer.panel', tab: next });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const settingsShown = data !== undefined && form !== null && active === 'settings';
  const roomyHeader = window.width >= ROOMY_HEADER_FROM;
  const budgets = budgetRows(data?.aiBudgets);
  // A budget that is running out is the one warning of the panel: a soft notice above every tab.
  const strained = budgets.filter((budget) => budget.state !== 'ok');
  const tabStyle = theme.tablet ? styles.tabFill : null;

  return (
    <Screen
      testID="developer-panel-screen"
      header={
        <ShellAppBar
          title={screenTitle('developer.panel', m.shell.tabs)}
          aside={
            <View style={styles.aside}>
              <Segmented<PanelSegment>
                options={[
                  ...developerPanelTabs(t.tabs).map((item) => ({ value: item.key as PanelSegment, label: item.label })),
                  { value: JOURNAL, label: t.journal, accessibilityLabel: m.developer.panel.openJournal },
                ]}
                value={active}
                onChange={selectTab}
                accessibilityLabel={t.tabsAria}
                role="tab"
                // Five dictionary labels: shown in full on a phone, on a narrow tablet and with a large OS
                // font (the bar scrolls when they cannot fit), never ellipsized.
                scrollable={!roomyHeader}
                style={styles.segments}
                testID="panel-tabs"
              />
              {theme.tablet && roomyHeader && settingsShown ? <SettingsSaveActions form={form} /> : null}
            </View>
          }
        />
      }
      bottomInset={false}
      // A tablet does not scroll the page: every panel of a tab scrolls its own content.
      scroll={!theme.tablet}
      maxWidth="full"
      scrollRef={scrollRef}
      onRefresh={refresh}
      refreshing={refreshing}
      footer={!theme.tablet && settingsShown ? <SettingsSaveBar form={form} /> : undefined}
    >
      {data && form ? (
        <>
          {strained.map((budget) => (
            <Notice
              key={budget.key}
              tone={budget.state === 'out' ? 'error' : 'warning'}
              text={format(m.developer.status.budgetSpent, { name: m.developer.status.budgetScopes[budget.key], percent: budget.percent })}
              testID={`panel-budget-notice-${budget.key}`}
            />
          ))}
          {/* Cached values stay on screen when a refresh fails (offline): say so instead of replacing them. */}
          {panel.isError ? (
            <Notice tone="error" text={errorText(panel.error, m.developer.panel.refreshFailed)} testID="panel-refresh-error" />
          ) : null}
          {/* The counters live on «Статус»; the actions change them, so that tab repeats the three main ones. */}
          {active === 'actions' ? <StatusChips figures={panelFigures(data.stats, data.settings, t)} /> : null}
          {theme.tablet && active === 'settings' ? (
            <View style={styles.statusRow}>
              <View style={styles.statusLine}>
                <SettingsStatusLine form={form} />
                <RetryWaitLine seconds={form.waitSeconds} testID="settings-wait" />
              </View>
              {/* A narrow tablet header has no room for the button next to the five segments and the title. */}
              {roomyHeader ? null : <SettingsSaveActions form={form} />}
            </View>
          ) : null}
          {/* Every tab stays mounted: a half-written broadcast or an action result survives a tab switch. */}
          <View style={active === 'status' ? tabStyle : styles.hidden}>
            <StatusTab data={data} />
          </View>
          <View style={active === 'actions' ? tabStyle : styles.hidden}>
            <ActionsTab budgets={budgets} />
          </View>
          <View style={active === 'broadcast' ? tabStyle : styles.hidden}>
            <BroadcastTab students={data.students} />
          </View>
          <View style={active === 'settings' ? tabStyle : styles.hidden}>
            <SettingsTab form={form} />
          </View>
        </>
      ) : isLoadFailed(panel) ? (
        <LoadFailure query={panel} testID="panel-error" />
      ) : (
        <LoadingState variant="cards" count={3} accessibilityLabel={m.common.a11y.loading} testID="panel-loading" />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  aside: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  // A phone gives the segments the whole row; in a tablet header they shrink before the save button does.
  segments: { flexShrink: 1, flexGrow: t.tablet ? 0 : 1, minWidth: 0 },
  // A tablet tab is a row of panels that runs down to the dock.
  tabFill: { flex: 1, minHeight: 0 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingHorizontal: t.space.xxs },
  statusLine: { flex: 1, minWidth: 0, gap: t.space.xxs },
  hidden: { display: 'none' },
}));
