import { View } from 'react-native';

import type { StudentCheckDto, StudentCheckResultDto } from '@/api/types';
import { RetryWaitLine } from '@/components/retry-wait';
import { formatDateTime } from '@/domain/dates';
import { checkErrorText } from '@/domain/solution-check-error-text';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Chip, Notice, Text, TextButton } from '@/ui';

import { CheckResultRow } from './check-result-row';
import { countVerdicts } from './logic';
import type { HomeworkCheckState } from './use-homework-check';

export type HomeworkCheckBlockProps = {
  /** The latest check of the homework; the student sees no history. */
  check: StudentCheckDto | null;
  hasPhotos: boolean;
  /** Runtime switch of the server: with it off the start is refused, so the button is off up front. */
  available: boolean;
  state: HomeworkCheckState;
  onRedo: (result: StudentCheckResultDto) => void;
};

/**
 * «Автоматическая проверка» (docs/spec/03-student-homework-lesson.md §1 H2.b): the start button with its
 * states, the running hint, the failure text of the check's error class and the verdicts of a finished
 * check. A finished result stays until a new check is started.
 */
export function HomeworkCheckBlock({ check, hasPhotos, available, state, onRedo }: HomeworkCheckBlockProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.student.check;

  const { running, starting, pollBroken, limit } = state;
  const label = running ? t.running : starting ? t.starting : t.start;
  const counts = check && check.status === 'DONE' ? countVerdicts(check.results) : null;

  return (
    <View style={styles.block} testID="homework-check">
      <View style={styles.titles}>
        <Text variant="cardTitle" accessibilityRole="header">
          {t.title}
        </Text>
        <Hint>
          <Text variant="small" color="textMuted">
            {t.subtitle}
          </Text>
        </Hint>
      </View>

      {!available ? <Notice tone="warning" text={dict.student.checkErrors.disabled} testID="homework-check-disabled" /> : null}

      {state.startError ? (
        <Notice
          tone="error"
          text={state.startError}
          onDismiss={state.dismissStartError}
          dismissLabel={m.common.actions.close}
          testID="homework-check-start-error"
        />
      ) : null}

      <Button
        label={label}
        onPress={state.start}
        loading={starting || running}
        disabled={!hasPhotos || !available || limit.waiting}
        accessibilityHint={!hasPhotos ? t.needPhotos : undefined}
        fullWidth
        testID="homework-check-start"
      />
      {/* Next to the locked button for as long as it is locked (the daily budget can last hours), whether or
          not the error notice above was dismissed (90-addendum-1 A.3 rule 3). */}
      <RetryWaitLine wait={limit} testID="homework-check-wait" />
      {/* The site explains the disabled button in a tooltip; a phone has none. */}
      {!hasPhotos && !running ? (
        <Text variant="caption" testID="homework-check-need-photos">
          {t.needPhotos}
        </Text>
      ) : null}

      {running ? (
        <Text variant="small" color="textMuted" testID="homework-check-running">
          {m.studentWork.check.runningHint}
        </Text>
      ) : null}

      {pollBroken ? (
        <Notice
          tone="error"
          text={m.studentWork.check.pollBroken}
          action={<TextButton label={m.studentWork.check.pollRetry} onPress={state.retryPoll} testID="homework-check-poll-retry" />}
          testID="homework-check-poll-broken"
        />
      ) : null}

      {check && check.status === 'FAILED' ? (
        <Text variant="smallMedium" color="dangerText" accessibilityRole="alert" testID="homework-check-failed">
          {checkErrorText(check.errorCode, dict.student.checkErrors)}
        </Text>
      ) : null}

      {check && counts ? (
        check.results.length === 0 ? (
          <Text variant="small" color="textMuted" testID="homework-check-empty">
            {t.statusDoneEmpty}
          </Text>
        ) : (
          <View style={styles.results} testID="homework-check-results">
            {check.checkedAt ? (
              <Text variant="caption">{format(t.checkedAt, { date: formatDateTime(check.checkedAt, locale) })}</Text>
            ) : null}
            <View style={styles.counters}>
              {counts.correct > 0 ? <Chip tone="green" icon="check" label={format(t.correctCount, { n: counts.correct })} /> : null}
              {counts.incorrect > 0 ? <Chip tone="red" icon="close" label={format(t.incorrectCount, { n: counts.incorrect })} /> : null}
              {counts.uncertain > 0 ? <Chip tone="muted" icon="clock" label={format(t.uncertainCount, { n: counts.uncertain })} /> : null}
            </View>
            {check.results.map((result) => (
              <CheckResultRow key={result.homeworkNumberId} result={result} onRedo={onRedo} />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.md },
  titles: { gap: 2 },
  results: { gap: t.space.sm },
  counters: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
