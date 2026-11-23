import { useState } from 'react';
import { View } from 'react-native';

import type { SolutionVerdict, StudentCheckResultDto } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles, type ColorToken } from '@/theme';
import { PressableScale, Text, TextButton } from '@/ui';

import { recognizedAnswerOf, shortenRecognizedAnswer } from './logic';

/** Only a wrong solution asks for attention; the other verdicts are plain text. */
const VERDICT_COLOR: Record<SolutionVerdict, ColorToken> = { CORRECT: 'textStrong', INCORRECT: 'redText', UNCERTAIN: 'textStrong' };

export type CheckResultRowProps = {
  result: StudentCheckResultDto;
  /** «Перерешать № N»: show the card of this problem. */
  onRedo: (result: StudentCheckResultDto) => void;
  /** Hairline under the row; off on the last one. */
  divider?: boolean;
};

/**
 * One verdict of a finished check (docs/spec/03-student-homework-lesson.md §1 H2.b "DONE with results"):
 * a row — «051004 · неверно» as its title (red only for a wrong solution), the recognised answer
 * (shortened; a tap shows it in full) and the comment as its caption, and — for a wrong solution — the way
 * to the number's card.
 */
export function CheckResultRow({ result, onRedo, divider = true }: CheckResultRowProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.student.check;
  const [expanded, setExpanded] = useState(false);

  const answer = recognizedAnswerOf(result);
  const short = answer ? shortenRecognizedAnswer(answer) : null;
  const shortened = answer !== null && short !== answer;

  return (
    <View style={[styles.row, divider ? styles.divider : null]} testID={`check-result-${result.number}`}>
      <Text variant="bodyStrong" color={VERDICT_COLOR[result.verdict]} accessibilityLabel={`${format(dict.topics.widgets.numberLabel, { number: result.number })}, ${t.verdicts[result.verdict]}`}>
        <Text variant="bodyStrong" tabular color={VERDICT_COLOR[result.verdict]}>
          {result.number}
        </Text>
        {` · ${t.verdicts[result.verdict].toLocaleLowerCase()}`}
      </Text>

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

      {result.comment ? (
        <Text variant="small" color="textMuted">
          {result.comment}
        </Text>
      ) : null}

      {result.verdict === 'INCORRECT' ? (
        <View style={styles.redo}>
          <TextButton
            label={format(t.redo, { number: result.number })}
            variant="buttonSm"
            onPress={() => onRedo(result)}
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
  row: { gap: t.space.xxxs, paddingVertical: t.space.md },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.line },
  answer: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
  redo: { gap: t.space.xxs, marginTop: t.space.xs, alignItems: 'flex-start' },
}));
