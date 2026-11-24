import { View } from 'react-native';

import type { LessonBoardItem } from '@/api/types';
import { MathContent } from '@/components/math';
import { statusLabel } from '@/components/numbers';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, IconButton, Text, accessibilityLabelOf, useStatusAnnouncement } from '@/ui';

import { SubmissionInfo } from './submission-info';

export type BoardItemCardProps = {
  item: LessonBoardItem;
  /** Another request of this participant is running, or set saves are cooling down: no removal now. */
  busy: boolean;
  /** Why the last result save of this number failed. */
  error?: string;
  spentMinutes?: number;
  now: number;
  /** The lesson is running. */
  live: boolean;
  onRemove: () => void;
  onHistory: () => void;
  onOpenPhoto: (index: number) => void;
};

/**
 * The ONE card of the number picked in a student's grid (docs/spec/05-teacher-lessons-plans.md §1.3 "Item
 * row"; layout: mockup `T-board`): the number with the one word why it is in the set, the two things done
 * to a number besides its result — its status history and taking it out of the set — as icon buttons, its
 * statement in a soft panel and the latest submission with the check's remarks. The student's own status
 * of the number is spelled out only when it is «нужна помощь». The result buttons stay under the card,
 * always in the same place.
 */
export function BoardItemCard({ item, busy, error, spentMinutes, now, live, onRemove, onHistory, onOpenPhoto }: BoardItemCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const common = dict.planner.common;
  const numberSign = format(common.numberSign, { n: item.number });
  const reasons: Record<string, string> = dict.planner.reasons;
  const reason = reasons[item.reason] ?? dict.planner.reasons.NEW;
  // The row's error appears without moving focus: spoken on both platforms (an Android `alert` role alone
  // is silent), the web reads the alert.
  useStatusAnnouncement(error);

  // Main part only, until the lesson gives a result: the student's current status of the number. Only the
  // one that asks for attention is drawn (red); every status is still read out.
  const studentStatus = !item.isExtra && item.result === null ? item.studentStatus : null;
  const statusText = studentStatus ? statusLabel(studentStatus, m.common.statuses) : null;

  return (
    <View style={styles.block} testID={`lesson-item-${item.id}`}>
      <View style={styles.head}>
        <View accessible accessibilityLabel={accessibilityLabelOf([numberSign, reason, statusText])} style={styles.titles}>
          <Text variant="bodyBold" tabular numberOfLines={1}>
            {numberSign}
          </Text>
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {reason}
            {studentStatus === 'RED' ? (
              <Text variant="small" color="redText">
                {` · ${statusText}`}
              </Text>
            ) : null}
          </Text>
        </View>
        <IconButton
          icon="history"
          accessibilityLabel={format(m.planner.lessonBoard.historyAria, { number: numberSign })}
          onPress={onHistory}
          testID={`lesson-item-history-${item.id}`}
        />
        <IconButton
          icon="trash"
          tint={theme.colors.dangerText}
          accessibilityLabel={format(common.removeNumber, { n: item.number })}
          disabled={busy}
          onPress={onRemove}
          testID={`lesson-item-remove-${item.id}`}
        />
      </View>

      {item.conditionLatex ? (
        <Card>
          <MathContent value={item.conditionLatex} variant="bare" />
        </Card>
      ) : null}

      {item.submission ? (
        <SubmissionInfo
          submission={item.submission}
          spentMinutes={spentMinutes}
          now={now}
          live={live}
          onOpenPhoto={onOpenPhoto}
          numberLabel={numberSign}
          testID={`lesson-item-submission-${item.id}`}
        />
      ) : null}

      {error ? (
        <Text variant="smallStrong" color="redText" accessibilityRole="alert" testID={`lesson-item-error-${item.id}`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  titles: { flex: 1, minWidth: 0 },
}));
