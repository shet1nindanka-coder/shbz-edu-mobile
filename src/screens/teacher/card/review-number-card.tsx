import { useState } from 'react';
import { View } from 'react-native';

import type { HomeworkNumberStatus, TeacherHomeworkCheckResult, TeacherHomeworkNumber } from '@/api/types';
import { MathContent } from '@/components/math';
import { statusLabel } from '@/components/numbers';
import { homeworkStatusLabel } from '@/domain/statuses';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Chip, PressableScale, StatusBadge, Text, TextButton, useStatusAnnouncement } from '@/ui';

import { DisclosureRow } from './disclosure-row';
import { hasResultDiagnostics, shortenRecognizedAnswer } from './review-logic';
import { StatusMarks } from './status-marks';

export type ReviewNumberCardProps = {
  /** The number with its current colour (an in-flight mark already applied). */
  number: TeacherHomeworkNumber;
  /** Verdict of the latest finished check for this number, if it has one. */
  result: TeacherHomeworkCheckResult | undefined;
  /** Lesson mode: the phone is turned towards the student, staff-only diagnostics are hidden. */
  lessonMode: boolean;
  /** This number's status request is in flight. */
  saving: boolean;
  /** Status writes are cooling down after a refusal that named a wait (the homework card says for how long). */
  blocked: boolean;
  /** Why the last status save failed. */
  error?: string;
  onStatus: (status: HomeworkNumberStatus | null) => void;
  onHistory: () => void;
};

/**
 * Everything about one number of a homework in the review (docs/spec/04-teacher-students.md S4 "number
 * card"), shown in the sheet a number row opens: the current status and the AI verdict of the latest
 * finished check, what the model recognised and said, the staff-only diagnostics, the student's note, the
 * statement with the reference answer on demand, the three status marks and the way to the status history.
 */
export function ReviewNumberCard({ number, result, lessonMode, saving, blocked, error, onStatus, onHistory }: ReviewNumberCardProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  // A refused mark appears under the marks without moving the focus: VoiceOver and TalkBack have to be told
  // (on Android role="alert" alone says nothing).
  useStatusAnnouncement(error);
  const t = dict.students.review;
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [fullAnswer, setFullAnswer] = useState(false);

  const recognized = result && result.verdict !== 'UNCERTAIN' ? (result.recognizedAnswer ?? '').trim() : '';
  const shortRecognized = recognized ? shortenRecognizedAnswer(recognized) : '';
  const showDiagnostics = !lessonMode && result !== undefined && hasResultDiagnostics(result);

  return (
    <View style={styles.card} testID={`review-number-${number.homeworkNumberId}`}>
      <View style={styles.head}>
        <StatusBadge status={number.status} label={statusLabel(number.status, m.common.statuses)} accessibilityLabel={homeworkStatusLabel(number.status, dict)} />
        {/* A colour only where the verdict asks for attention; «Верно» is a plain fact. */}
        {result ? (
          result.verdict === 'INCORRECT' ? (
            <Chip tone="red" label={t.verdict.INCORRECT.chip} />
          ) : (
            <Text variant="small" color="textMuted">
              {t.verdict[result.verdict].chip}
            </Text>
          )
        ) : null}
      </View>

      {shortRecognized ? (
        shortRecognized === recognized ? (
          <Text variant="small" color="textMuted" selectable>
            {format(t.recognized, { answer: recognized })}
          </Text>
        ) : (
          // The site shows the whole answer in a tooltip; here a tap unfolds it.
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={format(t.recognized, { answer: recognized })}
            accessibilityState={{ expanded: fullAnswer }}
            scaleTo={1}
            onPress={() => setFullAnswer((open) => !open)}
            testID={`review-number-recognized-${number.homeworkNumberId}`}
          >
            <Text variant="small" color="textMuted">
              {format(t.recognized, { answer: fullAnswer ? recognized : shortRecognized })}
            </Text>
          </PressableScale>
        )
      ) : null}

      {result?.comment ? <Text variant="body">{result.comment}</Text> : null}

      {number.note ? (
        <Card style={styles.note}>
          <Text variant="kicker" color="textMuted">
            {dict.student.numberCard.note}
          </Text>
          <Text variant="small" selectable>
            {number.note}
          </Text>
        </Card>
      ) : null}

      <StatusMarks
        accessibilityLabel={format(m.teacher.review.statusAria, { n: number.number })}
        value={number.status}
        onChange={onStatus}
        disabled={saving || blocked}
        testID={`review-number-sheet-status-${number.homeworkNumberId}`}
      />

      {error ? (
        <Text variant="captionStrong" color="dangerText" accessibilityRole="alert" testID={`review-number-error-${number.homeworkNumberId}`}>
          {error}
        </Text>
      ) : null}

      {showDiagnostics && result ? (
        <View>
          <DisclosureRow
            label={t.diagnosticsSummary}
            icon="lock"
            expanded={diagnosticsOpen}
            onToggle={() => setDiagnosticsOpen((open) => !open)}
            testID={`review-number-diagnostics-${number.homeworkNumberId}`}
          />
          {diagnosticsOpen ? (
            <View style={styles.diagnostics}>
              {result.copySuspected ? (
                <Text variant="small" color="label">
                  {t.copySuspected}
                  {result.copyReason ? `: ${result.copyReason}` : '.'}
                </Text>
              ) : null}
              {result.injectionSuspected ? (
                <Text variant="small" color="label">
                  {t.injectionNote}
                  {result.injectionNote ? `: ${result.injectionNote}` : '.'}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* PROPOSAL of the spec (04 S4, §7 item 15): the statement and the reference answer on demand. */}
      <View>
        <DisclosureRow
          label={conditionOpen ? m.teacher.review.hideCondition : dict.topics.singleNumber.sectionTitle}
          accessibilityLabel={format(conditionOpen ? m.teacher.review.hideConditionOf : m.teacher.review.showConditionOf, { n: number.number })}
          expanded={conditionOpen}
          onToggle={() => setConditionOpen((open) => !open)}
          testID={`review-number-condition-${number.homeworkNumberId}`}
        />
        {conditionOpen ? (
          <Card style={styles.condition}>
            <Text variant="kicker" color="textMuted">
              {dict.topics.viewNumbers.condition}
            </Text>
            {number.conditionLatex ? (
              <MathContent value={number.conditionLatex} variant="bare" />
            ) : (
              <Text variant="small" color="textMuted">
                {m.teacher.review.noCondition}
              </Text>
            )}
            <Text variant="kicker" color="textMuted">
              {dict.topics.viewNumbers.answer}
            </Text>
            {number.answerLatex ? (
              <MathContent value={number.answerLatex} variant="bare" />
            ) : (
              <Text variant="small" color="textMuted">
                {m.teacher.review.noAnswer}
              </Text>
            )}
          </Card>
        ) : null}
      </View>

      <TextButton
        label={dict.topics.history.show}
        accessibilityLabel={format(m.teacher.review.historyOf, { n: number.number })}
        onPress={onHistory}
        testID={`review-number-history-${number.homeworkNumberId}`}
        style={styles.history}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md, paddingBottom: t.space.sm },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.space.md, rowGap: t.space.xs },
  diagnostics: { gap: t.space.xxs, paddingLeft: t.sizes.icon.sm + t.space.sm, paddingBottom: t.space.xs },
  note: { gap: t.space.xxs },
  condition: { gap: t.space.xs },
  history: { alignSelf: 'flex-start' },
}));
