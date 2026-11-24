import { View } from 'react-native';

import type { StudentCheckDto, StudentCheckResultDto } from '@/api/types';
import { RetryWaitLine } from '@/components/retry-wait';
import { checkErrorText } from '@/domain/solution-check-error-text';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Notice, Text, TextButton } from '@/ui';

import { CheckResultRow } from './check-result-row';
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
 * states — it is off without photos (a screen reader hears why) and spins while the check runs — the
 * failure text of the check's error class and the verdicts of a finished check. No lines explain the
 * button. A finished result stays until a new check is started.
 */
export function HomeworkCheckBlock({ check, hasPhotos, available, state, onRedo }: HomeworkCheckBlockProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.student.check;

  const { running, starting, pollBroken, limit } = state;
  const label = running ? t.running : starting ? t.starting : t.start;
  const counts = check && check.status === 'DONE' ? check.results : null;

  return (
    <View style={styles.block} testID="homework-check">
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
        size="lg"
        leftIcon="sparkles"
        fullWidth
        testID="homework-check-start"
      />
      {/* Next to the locked button for as long as it is locked (the daily budget can last hours), whether or
          not the error notice above was dismissed (90-addendum-1 A.3 rule 3). */}
      <RetryWaitLine wait={limit} testID="homework-check-wait" />

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
            {check.results.map((result, index) => (
              <CheckResultRow key={result.homeworkNumberId} result={result} onRedo={onRedo} divider={index < check.results.length - 1} />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.md },
  results: { gap: t.space.xxs },
}));
