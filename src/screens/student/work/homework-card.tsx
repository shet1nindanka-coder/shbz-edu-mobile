import { View } from 'react-native';

import type { HomeworkNumberStatus, HomeworkSummaryDto } from '@/api/types';
import { formatDate } from '@/domain/dates';
import { isHomeworkOverdue } from '@/domain/statuses';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Card, Chip, ProgressBar, Spinner, Text, type ChipTone } from '@/ui';

import { homeworkLabel, homeworkListMeta, isCheckRunning, isHomeworkCompleted } from './logic';

const STATUS_CHIP: Record<HomeworkNumberStatus, ChipTone> = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' };

export type HomeworkCardProps = {
  homework: HomeworkSummaryDto;
  /** Server-corrected "now" — the overdue badge never trusts the device clock alone. */
  nowMs: number;
  onOpen: (homework: HomeworkSummaryDto) => void;
};

/**
 * Card of the homework list (docs/spec/03-student-homework-lesson.md §1 H1): «label · topic», the done /
 * overdue badge, the meta line, one status chip per number, the progress bar and «Открыть ДЗ». The whole
 * card opens the homework; the chips are not tappable.
 */
export function HomeworkCard({ homework, nowMs, onOpen }: HomeworkCardProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.student.submissions;
  const badges = dict.student.deadlineList;

  const title = `${homeworkLabel(homework, dict.common.homeworkN)} · ${homework.topicTitle}`;
  const completed = isHomeworkCompleted(homework);
  const overdue = isHomeworkOverdue(homework.deadlineAt, completed, nowMs);
  const meta = homeworkListMeta(homework, t, homework.deadlineAt ? formatDate(homework.deadlineAt, locale) : null);
  const progressLabel =
    homework.solvedPercent >= 100
      ? badges.progressDone
      : homework.solvedPercent <= 0
        ? badges.progressNotStarted
        : format(badges.progress, { percent: homework.solvedPercent });
  const open = () => onOpen(homework);

  return (
    <Card
      onPress={open}
      accessibilityLabel={format(m.studentWork.list.cardA11y, { title, meta })}
      accessibilityHint={t.open}
      testID={`homework-card-${homework.id}`}
      style={styles.card}
    >
      <View style={styles.head}>
        <Text variant="cardTitle" style={styles.title}>
          {title}
        </Text>
        {completed ? <Chip tone="green" label={badges.doneBadge} /> : null}
        {overdue ? <Chip tone="red" label={badges.overdueBadge} /> : null}
      </View>

      <Text variant="small" color="textMuted">
        {meta}
      </Text>

      {/* SPEC-GAP: the site list has no "check running" mark; `latestCheckStatus` exists in the mobile DTO
          for the list, so a homework whose check is in flight says so with the site's own wording. */}
      {isCheckRunning(homework.latestCheckStatus) ? (
        <View style={styles.running} accessible accessibilityLabel={dict.student.check.statusRunning}>
          <Spinner size={14} />
          <Text variant="captionStrong" color="textMuted">
            {dict.student.check.running}
          </Text>
        </View>
      ) : null}

      {homework.numbers.length > 0 ? (
        <View style={styles.chips}>
          {homework.numbers.map((number) => (
            <Chip
              key={number.homeworkNumberId}
              tone={number.status ? STATUS_CHIP[number.status] : 'muted'}
              label={format(dict.topics.widgets.numberLabel, { number: number.number })}
              accessibilityLabel={format(t.numberAria, {
                number: number.number,
                status: number.status ? dict.status[number.status].label : t.numberUnmarked,
              })}
            />
          ))}
        </View>
      ) : null}

      <ProgressBar value={homework.solvedPercent} accessibilityLabel={progressLabel} />

      <Button label={t.open} onPress={open} fullWidth testID={`homework-open-${homework.id}`} />
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.sm },
  title: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  running: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
