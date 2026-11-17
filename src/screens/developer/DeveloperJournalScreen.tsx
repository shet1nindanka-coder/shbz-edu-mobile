import { FlashList } from '@shopify/flash-list';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { qk, useApi } from '@/api';
import type { JournalEntry } from '@/api/types';
import { ProgressHistorySheet } from '@/components/progress-history';
import { format, plural, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import type { ScreenParams } from '@/navigation';
import { DetailAppBar } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { Button, Chip, EmptyState, LoadingState, Notice, Screen, Spinner, Text } from '@/ui';

import { errorText } from './panel/error-text';
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
import { LoadFailure, isLoadFailed } from './panel/load-failure';
import { useRefetchOnFocus } from './panel/use-refetch-on-focus';

/** Route params of `developer.journal` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type DeveloperJournalScreenProps = ScreenParams['developer.journal'];

type ProgressRef = NonNullable<JournalEntry['progressRef']>;

/**
 * `developer.journal` (docs/spec/07-developer-content.md §1.10): who called what on the platform — the
 * audit log, newest first, 50 rows per page. The site's 880-px table becomes cards; its filter row a
 * bottom sheet; its pager "show more" (the next page is also loaded when the list reaches its end).
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
  const [refreshing, setRefreshing] = useState(false);

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
  const stalled = switching && journal.fetchStatus === 'paused';

  const refresh = () => {
    setRefreshing(true);
    void journal.refetch().finally(() => setRefreshing(false));
  };
  const loadMore = () => {
    if (journal.hasNextPage && !journal.isFetching) void journal.fetchNextPage();
  };
  const openDetail = (entry: JournalEntry) => {
    setDetail(entry);
    setDetailOpen(true);
  };
  const openHistory = (ref: ProgressRef) => {
    // One sheet at a time: the detail leaves, the history takes its place.
    setDetailOpen(false);
    setHistory(ref);
    setHistoryOpen(true);
  };

  const actor = filters.actor ? first?.actors.find((candidate) => candidate.id === filters.actor) : undefined;
  const summary: { key: string; label: string; tone: 'muted' | 'red' }[] = [
    { key: 'period', label: periodLabel(filters.days, t.filters) ?? plural(locale, filters.days, m.developer.journal.periodForms), tone: 'muted' },
    ...(filters.category ? [{ key: 'category', label: categoryFilterLabel(filters.category, t.filters), tone: 'muted' as const }] : []),
    ...(actor ? [{ key: 'actor', label: actorOptionLabel(actor, t.roles), tone: 'muted' as const }] : []),
    ...(filters.action.trim() ? [{ key: 'action', label: format(m.developer.journal.actionQuoted, { text: filters.action.trim() }), tone: 'muted' as const }] : []),
    ...(filters.onlyFailed ? [{ key: 'failed', label: t.filters.onlyFailed, tone: 'red' as const }] : []),
  ];

  const header = (
    <View style={styles.header}>
      {first ? (
        <Hint>
          <Text variant="small" color="textMuted" testID="journal-intro">
            {format(t.intro, { days: first.retentionDays })}
          </Text>
        </Hint>
      ) : null}
      <View style={styles.filterRow}>
        <Button
          label={filterCount > 0 ? format(m.developer.journal.filtersCount, { n: filterCount }) : m.developer.journal.filters}
          variant="outline"
          leftIcon="filter"
          onPress={() => setFiltersOpen(true)}
          testID="journal-filters-open"
        />
        <View style={styles.total}>
          {switching && !stalled ? <Spinner size={14} color="accentSolid" /> : null}
          {first ? (
            <Text variant="smallMedium" color="textMuted" tabular testID="journal-total">
              {plural(locale, first.total, m.developer.journal.entryForms)}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.summary} testID="journal-filter-summary">
        {summary.map((chip) => (
          <Chip key={chip.key} label={chip.label} tone={chip.tone} />
        ))}
      </View>
      {stalled ? <Notice tone="warning" text={m.common.errors.network} testID="journal-offline-notice" /> : null}
      {/* Loaded rows stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {journal.isError && first && !journal.isFetchNextPageError ? (
        <Notice tone="error" text={errorText(journal.error, m.developer.journal.refreshFailed)} testID="journal-refresh-error" />
      ) : null}
    </View>
  );

  const footer =
    first && entries.length > 0 ? (
      <View style={styles.footer}>
        {journal.isFetchNextPageError ? (
          <Notice tone="error" text={errorText(journal.error, m.developer.journal.loadMoreFailed)} testID="journal-more-error" />
        ) : null}
        {first.pageCount > 1 ? (
          <Text variant="caption" align="center" tabular testID="journal-page-of">
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

  return (
    <Screen
      testID="developer-journal-screen"
      header={<DetailAppBar title={t.tab} subtitle={dict.planner.devPanel.title} />}
      // The journal lives in the stack of the «дев-панель» tab: the tab bar owns the bottom inset.
      bottomInset={false}
      scroll={!first}
      padded={!first}
      onRefresh={!first && isLoadFailed(journal) ? refresh : undefined}
      refreshing={refreshing}
    >
      {first ? (
        <FlashList
          data={entries}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => (
            <View style={[styles.item, switching ? styles.stale : null]}>
              <JournalEntryCard entry={item} onOpen={openDetail} />
            </View>
          )}
          extraData={switching}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={
            <View style={styles.item}>
              <EmptyState
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
            </View>
          }
          onEndReached={journal.isFetchNextPageError ? undefined : loadMore}
          onEndReachedThreshold={0.6}
          contentContainerStyle={styles.listContent}
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
      ) : (
        // The filter bar stays reachable: a selection that fails to load can still be changed.
        <>
          {header}
          {isLoadFailed(journal) ? (
            <LoadFailure query={journal} testID="journal-error" />
          ) : (
            <LoadingState variant="cards" count={5} cardHeight={132} accessibilityLabel={m.common.a11y.loading} testID="journal-loading" />
          )}
        </>
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
        onClosed={() => setDetail(null)}
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
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.md, paddingBottom: t.space.field },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  total: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs, flexShrink: 1 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  item: { paddingBottom: t.space.md },
  stale: { opacity: 0.55 },
  footer: { gap: t.space.md, paddingTop: t.space.xs },
}));
