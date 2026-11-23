import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText } from '@/api';
import type { GroupMemberRow, GroupStatisticsResponse, ReportPeriod } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { makeStyles } from '@/theme';
import {
  accessibilityLabelOf,
  Avatar,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ListCard,
  ListRow,
  LoadingState,
  Notice,
  SectionCaption,
  Text,
  TextButton,
  useInsideSurface,
  useRowInset,
} from '@/ui';

import { RED_ALERT_THRESHOLD, activityLabel, attentionLabels, summaryTiles, type SummaryTile } from '../logic';
import { CountUp } from './count-up';
import { ReportExportNotice, studentReportKey, type ReportExport } from './use-report-export';

export type StatisticsTabProps = {
  stats: UseQueryResult<GroupStatisticsResponse>;
  report: ReportExport;
};

/**
 * «Статистика группы» (06 §1.2 item 5, §4.2): four summary boxes and the members ranked by activity. A
 * member is one row — the name, what needs attention (or the last activity) and the week's count; the
 * numbers, the way to the student card and the PDF reports are in the sheet the row opens. The numbers
 * come ready from the server.
 */
export function StatisticsTab({ stats, report }: StatisticsTabProps) {
  const styles = useStyles();
  const inside = useInsideSurface();
  const inset = useRowInset();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.statistics;
  const data = stats.data;
  // The member stays set while the sheet slides away, so its content does not collapse mid-animation.
  const [opened, setOpened] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!data) {
    return isLoadFailed(stats) ? (
      <LoadFailure query={stats} testID="group-statistics-error" />
    ) : (
      <LoadingState variant="list" count={4} accessibilityLabel={m.common.a11y.loading} testID="group-statistics-loading" />
    );
  }

  if (data.members.length === 0) {
    return <EmptyState variant="plain" title={t.empty} testID="group-statistics-empty" />;
  }

  const tiles = summaryTiles(data, t);
  const grid = (
    <View style={styles.tiles}>
      <View style={styles.tileRow}>
        <Tile tile={tiles[0]} />
        <Tile tile={tiles[1]} />
      </View>
      <View style={styles.tileRow}>
        <Tile tile={tiles[2]} />
        <Tile tile={tiles[3]} />
      </View>
    </View>
  );
  const openedRow = data.members.find((row) => row.id === opened) ?? null;

  return (
    <View style={styles.tab} testID="group-statistics-tab">
      {stats.isError ? (
        <Notice tone="error" text={errorText(stats.error, m.common.errors.generic)} testID="group-statistics-refresh-error" />
      ) : null}

      {/* On the page the four boxes share one card; inside a tablet panel they already stand on one. */}
      {inside ? grid : <Card>{grid}</Card>}

      {/* While the member sheet is open it shows the outcome of a report itself. */}
      {sheetOpen ? null : <ReportExportNotice report={report} testID="group-statistics-report-error" />}

      <ListCard>
        {data.members.map((row, index) => {
          const flags = attentionLabels(row.attention, dict.planner.groupStatistics);
          const caption = flags.length > 0 ? flags.join(' · ') : activityLabel(row, t, locale);
          const week = format(t.closedFor7, { n: row.closed7 });
          return (
            <ListRow
              key={row.id}
              title={row.name}
              subtitle={caption}
              subtitleTone={flags.length > 0 ? 'attention' : 'muted'}
              subtitleLines={2}
              meta={week}
              left={<Avatar name={row.name} tone="neutral" />}
              inset={inset}
              divider={index < data.members.length - 1}
              onPress={() => {
                setOpened(row.id);
                setSheetOpen(true);
              }}
              accessibilityLabel={accessibilityLabelOf([format(m.stats.ranking.placeAria, { n: row.rank }), row.name, caption, week])}
              testID={`group-statistics-row-${row.id}`}
            />
          );
        })}
      </ListCard>

      <MemberStatsSheet row={openedRow} visible={sheetOpen && openedRow !== null} report={report} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

function Tile({ tile }: { tile: SummaryTile | undefined }) {
  const styles = useStyles();
  if (!tile) return null;
  return (
    <Card style={styles.tile} testID={`group-statistics-tile-${tile.key}`}>
      <Text variant="small" color="textMuted">
        {tile.label}
      </Text>
      {/* Two lines: a full name does not fit half a phone screen in one. */}
      <Text variant="cardTitle" numberOfLines={2}>
        {tile.value}
      </Text>
      {tile.hint ? (
        <Text variant="small" color="textMuted">
          {tile.hint}
        </Text>
      ) : null}
    </Card>
  );
}

type MemberStatsSheetProps = {
  row: GroupMemberRow | null;
  visible: boolean;
  report: ReportExport;
  onClose: () => void;
};

/** One member of the ranking in full: the place, the four numbers, what needs attention, the card and the reports. */
function MemberStatsSheet({ row, visible, report, onClose }: MemberStatsSheetProps) {
  const styles = useStyles();
  const navigation = useAppNavigation();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.statistics;
  const common = dict.planner.common;
  const periods: readonly { period: ReportPeriod; label: string }[] = [
    { period: '7d', label: common.forSevenDays },
    { period: '30d', label: common.forThirtyDays },
  ];

  let body = null;
  if (row) {
    const studentLink = { screen: 'teacher.student.review', studentId: row.id } as const;
    const flags = attentionLabels(row.attention, dict.planner.groupStatistics);
    body = (
      <View style={styles.sheet}>
        <Text variant="small" color="textMuted">
          {`${format(m.stats.ranking.placeAria, { n: row.rank })} · ${activityLabel(row, t, locale)}`}
        </Text>

        {flags.length > 0 ? (
          <View style={styles.flags}>
            {flags.map((flag) => (
              <Chip key={flag} tone="yellow" label={flag} />
            ))}
          </View>
        ) : null}

        <View style={styles.numbers}>
          <Stat value={row.closed7} label={t.for7} />
          <Stat value={row.closed30} label={t.for30} />
          <Stat value={row.red30} label={t.red} alert={row.red30 >= RED_ALERT_THRESHOLD} />
          <Stat value={row.streak} label={t.streak} />
        </View>

        <ReportExportNotice report={report} testID="group-statistics-sheet-report-error" />

        <View>
          <SectionCaption>{t.colReport}</SectionCaption>
          <View style={styles.reports}>
            {periods.map(({ period, label }) => (
              <Button
                key={period}
                label={label}
                accessibilityLabel={format(m.groups.statistics.reportAria, { name: row.name, period: label })}
                variant="outline"
                leftIcon="download"
                loading={report.pendingKey === studentReportKey(row.id, period)}
                disabled={report.blocked}
                onPress={() => report.exportStudentReport(row.id, period)}
                style={styles.report}
                testID={`group-statistics-report-${row.id}-${period}`}
              />
            ))}
          </View>
        </View>

        {/* A role that has no student card gets no link, never one that bounces home. */}
        {navigation.canOpen(studentLink) ? (
          <TextButton
            label={m.groups.statistics.openStudent}
            accessibilityLabel={format(m.groups.statistics.openStudentAria, { name: row.name })}
            onPress={() => {
              onClose();
              navigation.open(studentLink);
            }}
            style={styles.link}
            testID={`group-statistics-student-${row.id}`}
          />
        ) : null}
      </View>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={m.common.actions.close} title={row?.name} testID="group-statistics-sheet">
      {body}
    </BottomSheet>
  );
}

function Stat({ value, label, alert = false }: { value: number; label: string; alert?: boolean }) {
  const styles = useStyles();
  return (
    <Card padded={false} style={styles.stat}>
      <View accessible accessibilityLabel={`${value} ${label}`} style={styles.statBody}>
        <CountUp value={value} color={alert ? 'redText' : 'textStrong'} />
        <Text variant="small" color="textMuted" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  tab: { gap: t.space.block },
  tiles: { gap: t.space.sm },
  tileRow: { flexDirection: 'row', alignItems: 'stretch', gap: t.space.sm },
  tile: { flex: 1, minWidth: 0, gap: t.space.xxs },
  sheet: { gap: t.space.md },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  // Four equal boxes, the number over its label: side by side they do not fit a phone in one line.
  numbers: { flexDirection: 'row', gap: t.space.xs },
  stat: { flex: 1, minWidth: 0 },
  // Paddings sit on an inner view: on web a card's own `padding: 0` wins over longhand paddings.
  statBody: { paddingVertical: t.space.md, paddingHorizontal: t.space.xs, alignItems: 'center', gap: t.space.xxxs },
  reports: { flexDirection: 'row', gap: t.space.sm, paddingTop: t.space.xs },
  report: { flex: 1 },
  link: { alignSelf: 'flex-start' },
}));
