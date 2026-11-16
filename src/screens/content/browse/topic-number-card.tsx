import { memo } from 'react';
import { View } from 'react-native';

import type { TopicNumber } from '@/api/types';
import { MathContent } from '@/components/math';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Icon, PressableScale, Text } from '@/ui';

import { hasLatex } from '../shared/number-fill-status';

export type TopicNumberCardProps = {
  number: TopicNumber;
  /** The answer is revealed (kept by the screen: list rows are recycled). */
  answerShown: boolean;
  onToggleAnswer: (homeworkNumberId: string) => void;
};

/**
 * Number card of the topic view (docs/spec/07-developer-content.md §1.2 item 4): «№ 010203», the
 * statement or «Условие не добавлено.», and the answer behind a «Показать ответ» disclosure. Not a link:
 * the single-number screen is reached through number search only.
 */
export const TopicNumberCard = memo(function TopicNumberCard({ number, answerShown, onToggleAnswer }: TopicNumberCardProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.topics.viewNumbers;
  const condition = hasLatex(number.conditionLatex) ? (number.conditionLatex ?? '') : null;
  const answer = hasLatex(number.answerLatex) ? (number.answerLatex ?? '') : null;

  return (
    <Card variant="outline" padded={16} style={styles.card} testID={`topic-number-${number.number}`}>
      <Text variant="numberTitle" accessibilityRole="header">
        {format(dict.topics.widgets.numberLabel, { number: number.number })}
      </Text>

      {condition !== null ? (
        <View style={styles.block}>
          <Text variant="kickerSm">{t.condition}</Text>
          <MathContent value={condition} />
        </View>
      ) : (
        <Text variant="small" color="textMuted">
          {t.noCondition}
        </Text>
      )}

      {answer !== null ? (
        <View style={styles.block}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={answerShown ? m.content.topic.hideAnswer : t.showAnswer}
            accessibilityState={{ expanded: answerShown }}
            onPress={() => onToggleAnswer(number.id)}
            scaleTo={0.99}
            style={styles.disclosure}
            testID={`topic-number-answer-toggle-${number.number}`}
          >
            <Icon name={answerShown ? 'chevronUp' : 'chevronDown'} size={16} color="accentSolid" />
            <Text variant="link" color="accentSolid">
              {answerShown ? m.content.topic.hideAnswer : t.showAnswer}
            </Text>
          </PressableScale>
          {answerShown ? <MathContent value={answer} testID={`topic-number-answer-${number.number}`} /> : null}
        </View>
      ) : (
        <Text variant="small" color="textMuted">
          {t.noAnswer}
        </Text>
      )}
    </Card>
  );
});

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  block: { gap: t.space.xs },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs, minHeight: t.sizes.minTouch, alignSelf: 'flex-start' },
}));
