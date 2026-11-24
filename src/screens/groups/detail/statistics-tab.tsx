import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText } from '@/api';
import type { GroupMemberRow, GroupStatisticsResponse, ReportPeriod } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { makeStyles, useTheme } from '@/theme';
import {
  accessibilityLabelOf,
  Avatar,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  ListCard,
  ListRow,
  LoadingState,
  Notice,
  Text,
  TextButton,
  useInsideSurface,
  useRowInset,
} from '@/ui';

import { RED_ALERT_THRESHOLD, activityLabel, attentionLabels, groupFigures } from '../logic';
import { CountUp } from './count-up';
import { ReportExportNotice, studentReportKey, type ReportExport } from './use-report-export';

export type StatisticsTabProps = {
  stats: UseQueryResult<GroupStatisticsResponse>;
  report: ReportExport;
};

/**
 * «Статистика группы» (06 §1.2 item 5, §4.2; docs/design/glass-over-paper.md §1a): four figures of the
 * group, each with one word, and the members ranked by activity — the site's «самый активный» is the
 * first row. A member is one row: the name, the week's count on the right and, only when something needs
 * attention, its first reason in red. The other reasons, the last activity, the numbers, the way to the
 * student card and the PDF reports are in the sheet the row opens. The numbers come ready from the server.
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
    return <EmptyState variant="plain" title={dict.planner.groups.list.noStudents} testID="group-statistics-empty" />;
  }

  const figures = (
    <View style={styles.numbers}>
      {groupFigures(data, t, { label: m.groups.statistics.attention, aria: m.groups.statistics.attentionAria }).map((figure) => (
        <Stat
          key={figure.key}
          value={figure.value}
          label={figure.label}
          spoken={figure.spoken}
          alert={figure.alert}
          // On the page the card is the box of all four: a box each would leave «внимание» no room on a phone.
          boxed={inside}
          testID={`group-statistics-figure-${figure.key}`}
        />
      ))}
    </View>
  );
  const openedRow = data.members.find((row) => row.id === opened) ?? null;

  return (
    <View style={styles.tab} testID="group-statistics-tab">
      {stats.isError ? (
        <Notice tone="error" text={errorText(stats.error, m.common.errors.generic)} testID="group-statistics-refresh-error" />
      ) : null}

      {/* On the page the four figures share one card; inside a tablet panel they already stand on one. */}
      {inside ? figures : <Card>{figures}</Card>}

      {/* While the member sheet is open it shows the outcome of a report itself. */}
      {sheetOpen ? null : <ReportExportNotice report={report} testID="group-statistics-report-error" />}

      <ListCard>
        {data.members.map((row, index) => {
          const flags = attentionLabels(row.attention, dict.planner.groupStatistics);
          // What the ear gets in full: every reason (or the last activity) and «18 за 7 дней».
          const spoken = flags.length > 0 ? flags.join(' · ') : activityLabel(row, t, locale);
          const week = format(t.closedFor7, { n: row.closed7 });
          return (
            <ListRow
              key={row.id}
              title={row.name}
              // One caption, and only for attention: the first reason (the server orders them).
              subtitle={flags[0]}
              subtitleTone="attention"
              meta={String(row.closed7)}
              left={<Avatar name={row.name} tone="neutral" />}
              inset={inset}
              divider={index < data.members.length - 1}
              onPress={() => {
                setOpened(row.id);
                setSheetOpen(true);
              }}
              accessibilityLabel={accessibilityLabelOf([format(m.stats.ranking.placeAria, { n: row.rank }), row.name, spoken, week])}
              testID={`group-statistics-row-${row.id}`}
            />
          );
        })}
      </ListCard>

      <MemberStatsSheet row={openedRow} visible={sheetOpen && openedRow !== null} report={report} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

type MemberStatsSheetProps = {
  row: GroupMemberRow | null;
  visible: boolean;
  report: ReportExport;
  onClose: () => void;
};

/**
 * One member of the ranking in full: the last activity, what needs attention, the four numbers, the two
 * PDF reports (the download glyph says what the periods are) and the way to the student card.
 */
function MemberStatsSheet({ row, visible, report, onClose }: MemberStatsSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
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
        {/* The clock stands for «последняя активность»: the line itself is just «вчера». */}
        <View style={styles.activity}>
          <Icon name="clock" size={theme.sizes.icon.sm} color="textMuted" />
          <Text variant="small" color="textMuted" style={styles.activityText}>
            {activityLabel(row, t, locale)}
          </Text>
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

        <ReportExportNotice report={report} testID="group-statistics-sheet-report-error" />

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

type StatProps = {
  value: number;
  /** One word under the number. */
  label: string;
  /** What a screen reader says instead of «number label». */
  spoken?: string;
  alert?: boolean;
  /** A soft box around the figure (default); without it the figure is a bare column of its card. */
  boxed?: boolean;
  testID?: string;
};

/** A number over its one-word label. */
function Stat({ value, label, spoken, alert = false, boxed = true, testID }: StatProps) {
  const styles = useStyles();
  if (!boxed) {
    return (
      <View accessible accessibilityLabel={spoken ?? `${value} ${label}`} style={[styles.stat, styles.statBare]} testID={testID}>
        <CountUp value={value} color={alert ? 'redText' : 'textStrong'} />
        <Text variant="small" color="textMuted" numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  }
  return (
    <Card padded={false} style={styles.stat} testID={testID}>
      <View accessible accessibilityLabel={spoken ?? `${value} ${label}`} style={styles.statBody}>
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
  sheet: { gap: t.space.md },
  activity: { flexDirection: 'row', alignItems: 'center', gap: t.space.xxs },
  activityText: { flex: 1, minWidth: 0 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  // Four equal columns, the number over its label: side by side they would not fit a phone in one line.
  numbers: { flexDirection: 'row', gap: t.space.xs },
  stat: { flex: 1, minWidth: 0 },
  // Paddings sit on an inner view: on web a card's own `padding: 0` wins over longhand paddings.
  statBody: { paddingVertical: t.space.md, paddingHorizontal: t.space.xs, alignItems: 'center', gap: t.space.xxxs },
  statBare: { alignItems: 'center', gap: t.space.xxxs },
  reports: { flexDirection: 'row', gap: t.space.sm },
  report: { flex: 1 },
  link: { alignSelf: 'flex-start' },
}));
