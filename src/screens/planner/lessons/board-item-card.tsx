import { View } from 'react-native';

import type { LessonBoardItem } from '@/api/types';
import { MathContent } from '@/components/math';
import { statusLabel } from '@/components/numbers';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Text, TextButton, accessibilityLabelOf, useStatusAnnouncement } from '@/ui';

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
 * row"; layout: mockup `T-board`): why the number is in the set, its statement in a soft panel, the latest
 * submission with the check's remarks, and the two things done to a number besides its result — its status
 * history and taking it out of the set. The result buttons stay under the card, always in the same place.
 */
export function BoardItemCard({ item, busy, error, spentMinutes, now, live, onRemove, onHistory, onOpenPhoto }: BoardItemCardProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const common = dict.planner.common;
  const numberSign = format(common.numberSign, { n: item.number });
  const reasons: Record<string, string> = dict.planner.reasons;
  // The row's error appears without moving focus: spoken on both platforms (an Android `alert` role alone
  // is silent), the web reads the alert.
  useStatusAnnouncement(error);

  // Why the number was selected, and — main part only, until the lesson gives a result — the student's
  // current status of it. Neutral facts: one grey line, no labels.
  const facts = accessibilityLabelOf(
    [
      reasons[item.reason] ?? dict.planner.reasons.NEW,
      !item.isExtra && item.result === null && item.studentStatus ? statusLabel(item.studentStatus, m.common.statuses) : null,
    ],
    ' · ',
  );

  return (
    <View style={styles.block} testID={`lesson-item-${item.id}`}>
      <Text variant="small" color="textMuted">
        {facts}
      </Text>

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

      <View style={styles.links}>
        <TextButton
          label={dict.topics.history.show}
          accessibilityLabel={format(m.planner.lessonBoard.historyAria, { number: numberSign })}
          tone="muted"
          onPress={onHistory}
          testID={`lesson-item-history-${item.id}`}
        />
        <TextButton
          label={format(common.removeNumber, { n: item.number })}
          tone="danger"
          disabled={busy}
          onPress={onRemove}
          testID={`lesson-item-remove-${item.id}`}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: t.space.lg, rowGap: t.space.xs },
}));
