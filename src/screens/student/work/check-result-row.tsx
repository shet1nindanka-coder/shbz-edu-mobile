import { useState } from 'react';
import { View } from 'react-native';

import type { SolutionVerdict, StudentCheckResultDto } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, type ColorToken } from '@/theme';
import { Icon, PressableScale, Text, TextButton, type IconName } from '@/ui';

import { recognizedAnswerOf, shortenRecognizedAnswer } from './logic';

/** The verdict is a glyph on the right of the number; only a wrong solution is drawn in red. */
const VERDICT_ICON: Record<SolutionVerdict, IconName> = { CORRECT: 'check', INCORRECT: 'close', UNCERTAIN: 'help' };
const VERDICT_COLOR: Record<SolutionVerdict, ColorToken> = { CORRECT: 'textStrong', INCORRECT: 'redText', UNCERTAIN: 'textMuted' };

export type CheckResultRowProps = {
  result: StudentCheckResultDto;
  /** «Перерешать»: show the card of this problem. */
  onRedo: (result: StudentCheckResultDto) => void;
  /** Hairline under the row; off on the last one. */
  divider?: boolean;
};

/**
 * One verdict of a finished check (docs/spec/03-student-homework-lesson.md §1 H2.b "DONE with results"):
 * the number and the verdict as a glyph — a check, a red cross, a question mark (the words are the row's
 * accessible name) — then what the check has to say: the recognised answer (shortened; a tap shows it in
 * full) and its comment. A wrong solution gets the way to the number's card; an unclear one says in two
 * words that the teacher will look.
 */
export function CheckResultRow({ result, onRedo, divider = true }: CheckResultRowProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.student.check;
  const [expanded, setExpanded] = useState(false);

  const answer = recognizedAnswerOf(result);
  const short = answer ? shortenRecognizedAnswer(answer) : null;
  const shortened = answer !== null && short !== answer;
  const color = VERDICT_COLOR[result.verdict];

  return (
    <View style={[styles.row, divider ? styles.divider : null]} testID={`check-result-${result.number}`}>
      <View
        accessible
        accessibilityLabel={`${format(dict.topics.widgets.numberLabel, { number: result.number })}, ${t.verdicts[result.verdict]}`}
        style={styles.head}
      >
        <Text variant="bodyStrong" tabular color={result.verdict === 'INCORRECT' ? 'redText' : 'textStrong'} style={styles.number}>
          {result.number}
        </Text>
        <Icon name={VERDICT_ICON[result.verdict]} size={20} color={color} />
      </View>

      {result.verdict === 'UNCERTAIN' ? (
        <Text variant="small" color="textMuted">
          {dict.student.lessonView.verdicts.UNCERTAIN}
        </Text>
      ) : null}

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
            label={m.studentWork.check.redo}
            accessibilityLabel={format(t.redo, { number: result.number })}
            variant="buttonSm"
            onPress={() => onRedo(result)}
            testID={`check-redo-${result.number}`}
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { gap: t.space.xxxs, paddingVertical: t.space.md },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  number: { flex: 1, minWidth: 0 },
  answer: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
  redo: { marginTop: t.space.xs, alignItems: 'flex-start' },
}));
