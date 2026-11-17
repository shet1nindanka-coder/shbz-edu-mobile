import type { UseQueryResult } from '@tanstack/react-query';
import { View } from 'react-native';

import { errorText } from '@/api';
import type { GroupMemberRow, GroupStatisticsResponse, ReportPeriod } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { makeStyles, useTheme } from '@/theme';
import { AccentGradient, Button, Card, Chip, EmptyState, LoadingState, Notice, PressableScale, Text } from '@/ui';

import { RED_ALERT_THRESHOLD, activityLabel, attentionLabels, summaryTiles, type SummaryTile } from '../logic';
import { CountUp } from './count-up';
import { ReportExportNotice, studentReportKey, type ReportExport } from './use-report-export';

export type StatisticsTabProps = {
  stats: UseQueryResult<GroupStatisticsResponse>;
  report: ReportExport;
};

/**
 * «Статистика группы» (06 §1.2 item 5, §4.2): four summary tiles and the members ranked by activity, in
 * the stacked layout the site uses below its `lg` breakpoint. The numbers come ready from the server.
 */
export function StatisticsTab({ stats, report }: StatisticsTabProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.groups.statistics;
  const data = stats.data;

  if (!data) {
    return isLoadFailed(stats) ? (
      <LoadFailure query={stats} testID="group-statistics-error" />
    ) : (
      <LoadingState variant="cards" count={3} cardHeight={104} accessibilityLabel={m.common.a11y.loading} testID="group-statistics-loading" />
    );
  }

  if (data.members.length === 0) {
    return <EmptyState variant="plain" title={t.empty} testID="group-statistics-empty" />;
  }

  const tiles = summaryTiles(data, t);

  return (
    <View style={styles.tab} testID="group-statistics-tab">
      {stats.isError ? (
        <Notice tone="error" text={errorText(stats.error, m.common.errors.generic)} testID="group-statistics-refresh-error" />
      ) : null}

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

      <ReportExportNotice report={report} testID="group-statistics-report-error" />

      <Card variant="soft" padded={false}>
        {/* Paddings sit on an inner view: on web a card's own `padding: 0` wins over longhand paddings. */}
        <View style={styles.rows}>
          {data.members.map((row, index) => (
            <MemberRow
              key={row.id}
              row={row}
              leader={row.rank === 1 && data.mostActiveId !== null}
              divider={index < data.members.length - 1}
              report={report}
            />
          ))}
        </View>
      </Card>
    </View>
  );
}

function Tile({ tile }: { tile: SummaryTile | undefined }) {
  const styles = useStyles();
  if (!tile) return null;
  return (
    <Card variant="soft" padded={false} style={styles.tile} testID={`group-statistics-tile-${tile.key}`}>
      <View style={styles.tileBody}>
        <Text variant="kickerSm">{tile.label}</Text>
        {/* Two lines: a full name does not fit half a phone screen in one. */}
        <Text variant="miniStat" numberOfLines={2} style={styles.tileValue}>
          {tile.value}
        </Text>
        {tile.hint ? (
          <Text variant="hint" color="textMuted">
            {tile.hint}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function MemberRow({ row, leader, divider, report }: { row: GroupMemberRow; leader: boolean; divider: boolean; report: ReportExport }) {
  const styles = useStyles();
  const theme = useTheme();
  const navigation = useAppNavigation();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.statistics;
  const common = dict.planner.common;
  const studentLink = { screen: 'teacher.student.review', studentId: row.id } as const;
  const flags = attentionLabels(row.attention, dict.planner.groupStatistics);

  const name = (
    <Text variant="smallBold" numberOfLines={1}>
      {row.name}
    </Text>
  );
  const rank = (
    <Text variant="captionBold" tabular style={{ color: leader ? theme.colors.onAccent : theme.colors.segText }}>
      {row.rank}
    </Text>
  );
  const periods: readonly { period: ReportPeriod; label: string }[] = [
    { period: '7d', label: common.forSevenDays },
    { period: '30d', label: common.forThirtyDays },
  ];

  return (
    <View style={[styles.row, divider ? styles.rowDivider : null]} testID={`group-statistics-row-${row.id}`}>
      <View style={styles.nameRow}>
        <View accessible accessibilityLabel={format(m.stats.ranking.placeAria, { n: row.rank })}>
          {leader ? (
            <AccentGradient style={styles.rank}>{rank}</AccentGradient>
          ) : (
            <View style={[styles.rank, styles.rankPlain]}>{rank}</View>
          )}
        </View>
        {/* A role that has no student card gets plain text, never a link that bounces home. */}
        {navigation.canOpen(studentLink) ? (
          <PressableScale
            accessibilityRole="link"
            accessibilityLabel={format(m.groups.statistics.openStudentAria, { name: row.name })}
            onPress={() => navigation.open(studentLink)}
            scaleTo={1}
            hitSlop={{ top: 12, bottom: 12 }}
            style={styles.nameLink}
            pressedStyle={styles.pressed}
            testID={`group-statistics-student-${row.id}`}
          >
            {name}
          </PressableScale>
        ) : (
          <View style={styles.nameLink}>{name}</View>
        )}
      </View>

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

      <Text variant="meta" color="textMuted">
        {activityLabel(row, t, locale)}
      </Text>

      <View style={styles.reports}>
        <Text variant="captionStrong" color="textMuted">
          {t.colReport}
        </Text>
        {periods.map(({ period, label }) => (
          <Button
            key={period}
            label={label}
            accessibilityLabel={format(m.groups.statistics.reportAria, { name: row.name, period: label })}
            variant="outline"
            size="sm"
            loading={report.pendingKey === studentReportKey(row.id, period)}
            disabled={report.blocked}
            onPress={() => report.exportStudentReport(row.id, period)}
            testID={`group-statistics-report-${row.id}-${period}`}
          />
        ))}
      </View>
    </View>
  );
}

function Stat({ value, label, alert = false }: { value: number; label: string; alert?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <CountUp value={value} color={alert ? 'redText' : 'textStrong'} />
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  tab: { gap: t.space.lg },
  tiles: { gap: t.space.md },
  tileRow: { flexDirection: 'row', alignItems: 'stretch', gap: t.space.md },
  tile: { flex: 1, minWidth: 0 },
  tileBody: { paddingVertical: t.space.field, paddingHorizontal: t.space.gutter, gap: t.space.xxs },
  tileValue: { marginTop: t.space.xxs },
  rows: { paddingHorizontal: t.space.gutter, paddingVertical: t.space.xxs },
  row: { gap: t.space.sm, paddingVertical: t.space.gutter },
  rowDivider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 24, height: 24, borderRadius: t.radii.full, alignItems: 'center', justifyContent: 'center' },
  rankPlain: { backgroundColor: t.colors.segBg },
  nameLink: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.75 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  // Four equal columns, the number over its label: side by side they do not fit a phone in one line.
  numbers: { flexDirection: 'row', gap: t.space.sm },
  stat: { flex: 1, minWidth: 0 },
  reports: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.sm, marginTop: t.space.xxs },
}));
