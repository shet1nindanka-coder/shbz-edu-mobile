import { FlashList } from '@shopify/flash-list';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { JournalEntry } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { ProgressHistorySheet } from '@/components/progress-history';
import { format, plural, useI18n } from '@/i18n';
import { useRefetchOnFocus } from '@/navigation';
import type { ScreenParams } from '@/navigation';
import { Hint } from '@/providers';
import { DetailAppBar } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, Card, EmptyState, LoadingState, Notice, Panel, Panels, Screen, Spinner, Text } from '@/ui';

import { ListSlice } from './list-slice';
import { JournalDetailBody } from './panel/journal-detail-body';
import { JournalDetailSheet } from './panel/journal-detail-sheet';
import { JournalEntryCard } from './panel/journal-entry-card';
import { JournalFiltersSheet } from './panel/journal-filters-sheet';
import {
  activeFilterCount,
  actorOptionLabel,
  categoryFilterLabel,
  initialJournalFilters,
  mergeJournalPages,
  nextJournalPage,
  periodLabel,
  toJournalQuery,
  type JournalFilters,
} from './panel/journal-logic';

/** Route params of `developer.journal` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type DeveloperJournalScreenProps = ScreenParams['developer.journal'];

type ProgressRef = NonNullable<JournalEntry['progressRef']>;

/**
 * `developer.journal` (docs/spec/07-developer-content.md §1.10; layout: docs/design/glass-over-paper.md
 * §7): who called what on the platform — the audit log, newest first, 50 rows per page. The site's 880-px
 * table becomes rows of one card («what happened», one caption «who · when», a red mark only on a failed
 * entry); its filter row a bottom sheet behind the header button; its pager "show more" (the next page is
 * also loaded when the list reaches its end). A row opens the entry's details: a sheet on a phone, the
 * panel next to the list on a tablet.
 *
 * `outcome` / `days` come from a `dev_errors` notification (00 §3.3): they are the initial filter and stay
 * editable. No realtime, no polling (07 §5): the query runs on entry, on every filter change, on return
 * to the screen and on pull-to-refresh.
 */
export function DeveloperJournalScreen({ outcome, days }: DeveloperJournalScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.journal;

  const routeKey = `${outcome ?? ''}|${days ?? ''}`;
  const [filters, setFilters] = useState<JournalFilters>(() => initialJournalFilters({ outcome, days }));
  // A new arrival with other params (another notification) replaces the filters on screen.
  const [seenRouteKey, setSeenRouteKey] = useState(routeKey);
  if (seenRouteKey !== routeKey) {
    setSeenRouteKey(routeKey);
    setFilters(initialJournalFilters({ outcome, days }));
  }

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<JournalEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [history, setHistory] = useState<ProgressRef | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // The history chosen in the detail sheet, waiting for that sheet to finish closing.
  const queuedHistory = useRef<ProgressRef | null>(null);

  const query = useMemo(() => toJournalQuery(filters), [filters]);
  const journal = useInfiniteQuery({
    // "pages" keeps this paged cache apart from a plain read of one page under the same method key.
    queryKey: [...qk('developer', 'getJournal', query), 'pages'],
    queryFn: ({ pageParam }) => api.developer.getJournal({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: nextJournalPage,
    // The previous rows stay under the filter sheet while the new selection loads.
    placeholderData: keepPreviousData,
  });
  useRefetchOnFocus(journal.refetch);

  const pages = journal.data?.pages;
  const first = pages?.[0];
  const entries = useMemo(() => mergeJournalPages(pages ?? []), [pages]);
  const filterCount = activeFilterCount(filters);
  const switching = journal.isPlaceholderData;
  // Offline, the request for a new selection does not start (queries are `offlineFirst`): the rows on
  // screen belong to the previous selection and will stay until the connection returns — say so instead
  // of spinning for as long as the phone is offline.
  const paused = journal.fetchStatus === 'paused';
  const stalled = switching && paused;
  // Any other read parked offline over the rows on screen — «Показать ещё», the end-of-list load, a refresh on
  // return: its retry waits for the connection, which leaves neither a spinner nor an error (#403). Say so
  // (once: a parked filter switch has its own notice above).
  const readPaused = paused && !switching;
  const hasFooter = first !== undefined && entries.length > 0;

  const { refreshing, refresh } = usePullRefresh([journal]);
  // The end-of-list load: not while a read is parked offline (the footer says so; a tap on «Показать ещё»
  // restarts the request on purpose).
  const loadMore = () => {
    if (journal.hasNextPage && !journal.isFetching && !paused) void journal.fetchNextPage();
  };
  const openDetail = (entry: JournalEntry) => {
    setDetail(entry);
    // A tablet shows the entry in the panel next to the list; only a phone needs the sheet.
    if (!theme.tablet) setDetailOpen(true);
  };
  const openHistory = (ref: ProgressRef) => {
    if (!detailOpen) {
      // From the tablet panel: no sheet is on screen, the history opens at once.
      setHistory(ref);
      setHistoryOpen(true);
      return;
    }
    // One sheet at a time, and strictly one after the other: each sheet is a native modal, and iOS refuses
    // to present a second one while the first is still on screen (it is never retried). The history is
    // therefore opened by `onClosed` of the detail sheet, not in the tick that starts its exit.
    queuedHistory.current = ref;
    setDetailOpen(false);
  };
  const onDetailClosed = () => {
    setDetail(null);
    const ref = queuedHistory.current;
    queuedHistory.current = null;
    if (!ref) return;
    setHistory(ref);
    setHistoryOpen(true);
  };

  const actor = filters.actor ? first?.actors.find((candidate) => candidate.id === filters.actor) : undefined;
  // The selection in force, as one line of plain text: neutral facts are not labels.
  const summary = [
    periodLabel(filters.days, t.filters) ?? plural(locale, filters.days, m.developer.journal.periodForms),
    filters.category ? categoryFilterLabel(filters.category, t.filters) : null,
    actor ? actorOptionLabel(actor, t.roles) : null,
    filters.action.trim() ? format(m.developer.journal.actionQuoted, { text: filters.action.trim() }) : null,
    filters.onlyFailed ? t.filters.onlyFailed : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // The entry of the tablet panel: the tapped one while it is still in the list, else the newest.
  const shownEntry = theme.tablet ? (entries.find((entry) => entry.id === detail?.id) ?? entries[0] ?? null) : null;

  const header = (
    <View style={styles.header}>
      {first ? (
        <Hint>
          <Text variant="small" color="textMuted" testID="journal-intro">
            {format(t.intro, { days: first.retentionDays })}
          </Text>
        </Hint>
      ) : null}
      <View style={styles.summaryRow}>
        <Text variant="small" color="textMuted" style={styles.summary} testID="journal-filter-summary">
          {summary}
        </Text>
        <View style={styles.total}>
          {switching && !stalled ? <Spinner color="accentSolid" /> : null}
          {first ? (
            <Text variant="small" color="textMuted" tabular testID="journal-total">
              {plural(locale, first.total, m.developer.journal.entryForms)}
            </Text>
          ) : null}
        </View>
      </View>
      {stalled ? <Notice tone="warning" text={m.common.errors.network} testID="journal-offline-notice" /> : null}
      {/* Loaded rows stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {readPaused && !hasFooter ? <Notice tone="error" text={m.common.errors.network} testID="journal-paused-notice" /> : null}
      {journal.isError && first && !journal.isFetchNextPageError && !paused ? (
        <Notice tone="error" text={errorText(journal.error, m.developer.journal.refreshFailed)} testID="journal-refresh-error" />
      ) : null}
    </View>
  );

  const footer =
    first && entries.length > 0 ? (
      <View style={[styles.footer, theme.tablet ? styles.footerPanel : null]}>
        {readPaused || journal.isFetchNextPageError ? (
          <Notice
            tone="error"
            text={readPaused ? m.common.errors.network : errorText(journal.error, m.developer.journal.loadMoreFailed)}
            testID="journal-more-error"
          />
        ) : null}
        {first.pageCount > 1 ? (
          <Text variant="small" color="textMuted" align="center" tabular testID="journal-page-of">
            {format(t.pageOf, { page: pages?.length ?? 1, total: first.pageCount })}
          </Text>
        ) : null}
        {journal.hasNextPage ? (
          <Button
            label={m.common.actions.showMore}
            variant="outline"
            loading={journal.isFetchingNextPage}
            onPress={() => void journal.fetchNextPage()}
            testID="journal-more"
          />
        ) : null}
      </View>
    ) : null;

  const list = first ? (
    <FlashList
      data={entries}
      keyExtractor={(entry) => entry.id}
      renderItem={({ item, index }) => (
        <View style={switching ? styles.stale : null} testID={`journal-entry-${item.id}`}>
          <ListSlice first={index === 0} last={index === entries.length - 1} inCard={theme.tablet}>
            <JournalEntryCard
              entry={item}
              divider={index < entries.length - 1}
              selected={shownEntry?.id === item.id}
              onOpen={openDetail}
            />
          </ListSlice>
        </View>
      )}
      // The selected row and the dimming live outside the entries.
      extraData={[switching, shownEntry?.id, entries.length]}
      // On a phone the head of the page scrolls with the list; on a tablet it stands above the panels.
      ListHeaderComponent={theme.tablet ? null : header}
      ListFooterComponent={footer}
      ListEmptyComponent={
        <EmptyState
          variant={theme.tablet ? 'plain' : 'panel'}
          title={t.empty}
          action={
            filterCount > 0 ? (
              <Button
                label={m.developer.journal.resetFilters}
                variant="outline"
                onPress={() => setFilters(initialJournalFilters({}))}
                testID="journal-empty-reset"
              />
            ) : undefined
          }
          testID="journal-empty"
        />
      }
      onEndReached={journal.isFetchNextPageError || paused ? undefined : loadMore}
      onEndReachedThreshold={0.6}
      contentContainerStyle={theme.tablet ? styles.panelContent : styles.listContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={theme.colors.accentSolid}
          colors={[theme.colors.accentSolid]}
          progressBackgroundColor={theme.colors.cardBg}
        />
      }
      testID="journal-list"
    />
  ) : null;

  return (
    <Screen
      testID="developer-journal-screen"
      header={
        <DetailAppBar
          title={t.tab}
          backTitle={m.shell.tabs.panel}
          right={
            <Button
              label={filterCount > 0 ? format(m.developer.journal.filtersCount, { n: filterCount }) : m.developer.journal.filters}
              variant="outline"
              leftIcon="filter"
              onPress={() => setFiltersOpen(true)}
              testID="journal-filters-open"
            />
          }
        />
      }
      // The journal lives in the stack of the «дев-панель» tab: the dock owns the bottom inset.
      bottomInset={false}
      scroll={!first}
      padded={!first || theme.tablet}
      maxWidth="full"
      onRefresh={!first && isLoadFailed(journal) ? refresh : undefined}
      refreshing={refreshing}
    >
      {!first ? (
        // The filter button stays reachable: a selection that fails to load can still be changed.
        <>
          {header}
          {isLoadFailed(journal) ? (
            <LoadFailure query={journal} testID="journal-error" />
          ) : (
            <LoadingState variant="list" count={6} accessibilityLabel={m.common.a11y.loading} testID="journal-loading" />
          )}
        </>
      ) : theme.tablet ? (
        <>
          {header}
          <Panels>
            {/* Not a `Panel`: that one scrolls its children, and this list scrolls (and virtualises) itself. */}
            <Card padded={false} style={styles.listPanel}>
              {list}
            </Card>
            {shownEntry ? (
              <Panel weight={2} testID="journal-detail-panel">
                <Text variant="sectionTitle" accessibilityRole="header">
                  {shownEntry.actionLabel ?? shownEntry.action}
                </Text>
                <JournalDetailBody entry={shownEntry} onOpenHistory={openHistory} />
              </Panel>
            ) : null}
          </Panels>
        </>
      ) : (
        list
      )}

      <JournalFiltersSheet
        visible={filtersOpen}
        filters={filters}
        actors={first?.actors ?? []}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
      />
      <JournalDetailSheet
        entry={detail}
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
        onClosed={onDetailClosed}
        onOpenHistory={openHistory}
      />
      {history ? (
        <ProgressHistorySheet
          studentId={history.studentId}
          homeworkNumberId={history.homeworkNumberId}
          visible={historyOpen}
          onClose={() => setHistoryOpen(false)}
          testID="journal-history-sheet"
        />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  // Phone: the list is the page.
  listContent: { paddingHorizontal: t.space.gutter, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.sm, paddingBottom: t.space.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.space.md, paddingHorizontal: t.space.xxs },
  summary: { flex: 1, minWidth: 0 },
  total: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs, flexShrink: 0 },
  // Rows of the previous selection, while the new one loads.
  stale: { opacity: 0.55 },
  footer: { gap: t.space.md, paddingTop: t.space.md },
  // Tablet: the list is the content of the left panel, a card that runs down to the dock.
  listPanel: { flex: 3, minWidth: 0, minHeight: 0, overflow: 'hidden' },
  // The inner padding of a card of rows.
  panelContent: { paddingVertical: t.space.sm },
  footerPanel: { paddingHorizontal: t.space.card, paddingBottom: t.space.card },
}));
