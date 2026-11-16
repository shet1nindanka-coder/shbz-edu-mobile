import { useState } from 'react';
import { View } from 'react-native';

import type { HomeworkNumberStatus, SolutionVerdict, TeacherHomeworkCheckResult, TeacherHomeworkNumber } from '@/api/types';
import { MathContent } from '@/components/math';
import { HOMEWORK_STATUS_ORDER } from '@/domain/statuses';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Chip, PressableScale, StatusBadge, StatusOptionGroup, Text, TextButton, type ChipTone } from '@/ui';

import { RateLimitLine } from '../students/rate-limit-line';
import { DisclosureRow } from './disclosure-row';
import { hasResultDiagnostics, shortenRecognizedAnswer } from './review-logic';

export type ReviewNumberCardProps = {
  /** The number with its current colour (an in-flight mark already applied). */
  number: TeacherHomeworkNumber;
  /** Verdict of the latest finished check for this number, if it has one. */
  result: TeacherHomeworkCheckResult | undefined;
  /** Lesson mode: the phone is turned towards the student, staff-only diagnostics are hidden. */
  lessonMode: boolean;
  /** This number's status request is in flight. */
  saving: boolean;
  /** Status writes are cooling down after a refusal that named a wait; `waitSeconds` says for how long. */
  blocked: boolean;
  waitSeconds: number;
  /** Why the last status save failed. */
  error?: string;
  onStatus: (status: HomeworkNumberStatus | null) => void;
  onHistory: () => void;
};

const VERDICT_CHIP: Record<SolutionVerdict, ChipTone> = { CORRECT: 'green', INCORRECT: 'red', UNCERTAIN: 'muted' };

/**
 * One number of a homework in the review (docs/spec/04-teacher-students.md S4 "number card"): the AI
 * verdict of the latest finished check, the current colour, what the model recognised and said, the
 * staff-only diagnostics, the student's note and the three traffic-light buttons. A 3 px stripe on the
 * left repeats the verdict so the column can be scanned.
 */
export function ReviewNumberCard({ number, result, lessonMode, saving, blocked, waitSeconds, error, onStatus, onHistory }: ReviewNumberCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.students.review;
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [fullAnswer, setFullAnswer] = useState(false);

  const stripe =
    result?.verdict === 'CORRECT'
      ? theme.colors.accentSolid
      : result?.verdict === 'INCORRECT'
        ? theme.colors.dangerText
        : result?.verdict === 'UNCERTAIN'
          ? theme.colors.kicker
          : theme.colors.softBorder;

  const recognized = result && result.verdict !== 'UNCERTAIN' ? (result.recognizedAnswer ?? '').trim() : '';
  const shortRecognized = recognized ? shortenRecognizedAnswer(recognized) : '';
  const showDiagnostics = !lessonMode && result !== undefined && hasResultDiagnostics(result);
  const label = format(t.number, { n: number.number });

  return (
    <View style={[styles.card, { borderLeftColor: stripe }]} testID={`review-number-${number.homeworkNumberId}`}>
      <View style={styles.head}>
        <Text variant="bodyBold" tabular accessibilityRole="header">
          {label}
        </Text>
        {result ? <Chip tone={VERDICT_CHIP[result.verdict]} label={t.verdict[result.verdict].chip} /> : null}
        <StatusBadge
          status={number.status}
          label={number.status ? dict.status[number.status].shortLabel : dict.student.statusBadge.unmarked}
        />
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

      {result?.comment ? <Text variant="small">{result.comment}</Text> : null}

      {showDiagnostics && result ? (
        <View>
          <DisclosureRow
            label={t.diagnosticsSummary}
            variant="captionStrong"
            color="textMuted"
            expanded={diagnosticsOpen}
            onToggle={() => setDiagnosticsOpen((open) => !open)}
            testID={`review-number-diagnostics-${number.homeworkNumberId}`}
          />
          {diagnosticsOpen ? (
            <View style={styles.diagnostics}>
              {result.copySuspected ? (
                <Text variant="caption" color="label">
                  {t.copySuspected}
                  {result.copyReason ? `: ${result.copyReason}` : '.'}
                </Text>
              ) : null}
              {result.injectionSuspected ? (
                <Text variant="caption" color="label">
                  {t.injectionNote}
                  {result.injectionNote ? `: ${result.injectionNote}` : '.'}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {number.note ? (
        <View style={styles.note}>
          <Text variant="small" selectable>
            {number.note}
          </Text>
        </View>
      ) : null}

      {/* PROPOSAL of the spec (04 S4, §7 item 15): the statement and the reference answer on demand. */}
      <View>
        <DisclosureRow
          label={conditionOpen ? m.teacher.review.hideCondition : m.teacher.review.showCondition}
          variant="captionStrong"
          color="textMuted"
          expanded={conditionOpen}
          onToggle={() => setConditionOpen((open) => !open)}
          testID={`review-number-condition-${number.homeworkNumberId}`}
        />
        {conditionOpen ? (
          <View style={styles.condition}>
            <Text variant="kickerSm">{m.teacher.review.condition}</Text>
            {number.conditionLatex ? (
              <MathContent value={number.conditionLatex} variant="bare" />
            ) : (
              <Text variant="caption" color="textMuted">
                {m.teacher.review.noCondition}
              </Text>
            )}
            <Text variant="kickerSm">{m.teacher.review.answer}</Text>
            {number.answerLatex ? (
              <MathContent value={number.answerLatex} variant="bare" />
            ) : (
              <Text variant="caption" color="textMuted">
                {m.teacher.review.noAnswer}
              </Text>
            )}
          </View>
        ) : null}
      </View>

      <StatusOptionGroup
        accessibilityLabel={format(m.teacher.review.statusAria, { n: number.number })}
        options={HOMEWORK_STATUS_ORDER.map((value) => ({ value, label: dict.status[value].shortLabel, tone: value }))}
        value={number.status}
        onChange={onStatus}
        columns={3}
        disabled={saving || blocked}
        testID={`review-number-status-${number.homeworkNumberId}`}
      />

      {error ? (
        <View style={styles.error}>
          <Text variant="captionStrong" color="dangerText" accessibilityRole="alert" testID={`review-number-error-${number.homeworkNumberId}`}>
            {error}
          </Text>
          <RateLimitLine seconds={waitSeconds} testID={`review-number-wait-${number.homeworkNumberId}`} />
        </View>
      ) : null}

      <TextButton
        label={dict.topics.history.show}
        tone="muted"
        onPress={onHistory}
        testID={`review-number-history-${number.homeworkNumberId}`}
        style={styles.history}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    gap: t.space.sm,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderLeftWidth: 3,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.space.sm, rowGap: t.space.xs },
  diagnostics: { gap: t.space.xxs, paddingLeft: 16 + t.space.sm, paddingBottom: t.space.xs },
  note: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: t.radii.md, backgroundColor: t.colors.tabHover },
  condition: { gap: t.space.xs, paddingBottom: t.space.xs },
  error: { gap: t.space.xxs },
  history: { alignSelf: 'flex-start' },
}));
