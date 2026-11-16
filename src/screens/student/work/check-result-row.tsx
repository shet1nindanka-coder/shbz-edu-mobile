import { useState } from 'react';
import { View } from 'react-native';

import type { SolutionVerdict, StudentCheckResultDto } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { Button, Chip, PressableScale, Text, type ChipTone } from '@/ui';

import { recognizedAnswerOf, shortenRecognizedAnswer } from './logic';

const VERDICT_CHIP: Record<SolutionVerdict, ChipTone> = { CORRECT: 'green', INCORRECT: 'red', UNCERTAIN: 'muted' };

export type CheckResultRowProps = {
  result: StudentCheckResultDto;
  /** «Перерешать № N»: scroll to the number card of this problem. */
  onRedo: (result: StudentCheckResultDto) => void;
};

/**
 * One verdict of a finished check (docs/spec/03-student-homework-lesson.md §1 H2.b "DONE with results"):
 * a stripe in the verdict colour, «№ N» with the verdict pill, the recognised answer (shortened; a tap
 * shows it in full), the comment and — for a wrong solution — the way to the number card.
 */
export function CheckResultRow({ result, onRedo }: CheckResultRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.student.check;
  const [expanded, setExpanded] = useState(false);

  const stripe =
    result.verdict === 'CORRECT'
      ? theme.status.GREEN.text
      : result.verdict === 'INCORRECT'
        ? theme.status.RED.text
        : theme.colors.kicker;
  const answer = recognizedAnswerOf(result);
  const short = answer ? shortenRecognizedAnswer(answer) : null;
  const shortened = answer !== null && short !== answer;

  return (
    <View style={[styles.row, { borderLeftColor: stripe }]} testID={`check-result-${result.number}`}>
      <View style={styles.head}>
        <Text variant="smallBold">{format(dict.topics.widgets.numberLabel, { number: result.number })}</Text>
        <Chip tone={VERDICT_CHIP[result.verdict]} label={t.verdicts[result.verdict]} />
      </View>

      {answer ? (
        shortened ? (
          // The site keeps the full text in a tooltip; here a tap unfolds it.
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={format(expanded ? m.studentWork.check.answerCollapseA11y : m.studentWork.check.answerExpandA11y, {
              answer,
            })}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            scaleTo={1}
            style={styles.answer}
          >
            <Text variant="small" color="textMuted">
              {format(t.answer, { answer: expanded ? answer : (short ?? answer) })}
            </Text>
          </PressableScale>
        ) : (
          <Text variant="small" color="textMuted">
            {format(t.answer, { answer })}
          </Text>
        )
      ) : null}

      {result.comment ? <Text variant="small">{result.comment}</Text> : null}

      {result.verdict === 'INCORRECT' ? (
        <View style={styles.redo}>
          <Button
            label={format(t.redo, { number: result.number })}
            variant="outline"
            onPress={() => onRedo(result)}
            style={styles.redoButton}
            testID={`check-redo-${result.number}`}
          />
          <Hint>
            <Text variant="hint">{t.redoHint}</Text>
          </Hint>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    gap: t.space.xs,
    paddingVertical: t.space.sm,
    paddingLeft: t.space.md,
    paddingRight: t.space.md,
    borderLeftWidth: 3,
    borderRadius: t.radii.sm,
    backgroundColor: t.colors.softBg,
  },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.sm },
  answer: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
  redo: { gap: t.space.xs, marginTop: t.space.xxs },
  redoButton: { alignSelf: 'flex-start' },
}));
