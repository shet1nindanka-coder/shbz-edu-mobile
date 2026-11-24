import { View } from 'react-native';

import { RetryWaitLine } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { Button, Icon, Notice, Segmented, Text, TextArea, accessibilityLabelOf } from '@/ui';

import type { RecordCallForm } from './use-record-call';

/**
 * The fields of «Записать звонок»: how the call ended and the comment, marked as the teacher's own (the
 * lock and «виден только вам»: nobody else on the platform reads it, except the developer). The field has
 * one name — its label; the site's placeholder sentence is not shown.
 */
export function RecordCallFields({ form }: { form: RecordCallForm }) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.planner.calls;

  return (
    <View style={styles.form}>
      <Segmented
        options={[
          { value: 'REACHED', label: t.reached },
          { value: 'NO_ANSWER', label: t.noAnswer },
        ]}
        value={form.outcome}
        onChange={form.setOutcome}
        accessibilityLabel={t.outcomeAria}
        fill
        disabled={form.pending}
        testID="call-record-outcome"
      />

      <View style={styles.field}>
        <View style={styles.label}>
          <Icon name="lock" size={theme.sizes.icon.sm} color="textMuted" />
          <Text variant="label" style={styles.labelText}>
            {t.comment}
          </Text>
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {m.calls.form.onlyYou}
          </Text>
        </View>
        <TextArea
          value={form.comment}
          onChangeText={form.setComment}
          accessibilityLabel={accessibilityLabelOf([t.comment, m.calls.form.onlyYou])}
          numberOfLines={3}
          autoCapitalize="sentences"
          disabled={form.pending}
          testID="call-record-comment"
        />
      </View>

      <Hint>
        <Text variant="hint" color="textMuted">
          {m.calls.form.attemptHint}
        </Text>
      </Hint>

      {form.error ? <Notice tone="error" text={form.error} testID="call-record-error" /> : null}
      {/* Outside the error: the limiter bucket is the teacher's, so a form opened for another student
          (which starts without an error) is locked too and must say until when. */}
      <RetryWaitLine seconds={form.wait.seconds} testID="call-record-wait" />
    </View>
  );
}

export type RecordCallSaveButtonProps = {
  form: RecordCallForm;
  /** The list is reloading after a saved call: the next record waits for the new state. */
  settling: boolean;
};

/** The one main action of the form — the gradient button. */
export function RecordCallSaveButton({ form, settling }: RecordCallSaveButtonProps) {
  const { dict } = useI18n();
  const t = dict.planner.calls;
  return (
    <Button
      // One word: the sheet is about one call. The site's «Сохранить звонок» is the spoken name.
      label={form.pending ? t.saving : dict.common.save}
      accessibilityLabel={form.pending ? t.saving : t.save}
      size="lg"
      fullWidth
      onPress={form.submit}
      loading={form.pending}
      disabled={form.wait.waiting || settling}
      testID="call-record-save"
    />
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.space.md },
  field: { gap: t.space.xxs },
  label: { flexDirection: 'row', alignItems: 'center', gap: t.space.xxs },
  // The name of the field on the left, the privacy promise at the right edge of the same line.
  labelText: { flex: 1, minWidth: 0 },
}));
