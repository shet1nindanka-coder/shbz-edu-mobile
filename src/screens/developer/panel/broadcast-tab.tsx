import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import { RetryWaitLine } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Card, Dialog, IconButton, Segmented, Text, TextArea, TextField } from '@/ui';

import {
  BROADCAST_BODY_MAX,
  BROADCAST_TITLE_MAX,
  broadcastRequest,
  canSubmitBroadcast,
  pickedStudents,
  toggleRecipient,
  type BroadcastMode,
  type BroadcastStudent,
} from './logic';
import { RecipientsSheet } from './recipients-sheet';
import { ResultLine, type PanelResult } from './result-line';
import { useRetryLock } from './use-retry-lock';

/**
 * Broadcast tab (07 §1.9): a notification for all students or for the chosen ones — students only, shown
 * to them as typed. On success the form and the picked list are reset (the mode returns to "all").
 */
export function BroadcastTab({ students }: { students: readonly BroadcastStudent[] }) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel.broadcast;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<BroadcastMode>('all');
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [result, setResult] = useState<PanelResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const lock = useRetryLock();
  // «Далее» on the title moves to the text instead of closing the keyboard.
  const bodyRef = useRef<TextInputInstance>(null);

  const picked = pickedStudents(students, pickedIds);

  const send = useMutation({
    mutationFn: () => api.developer.broadcast(broadcastRequest({ title, body, mode, pickedIds: picked.map((student) => student.id) })),
    onSuccess: (answer) => {
      setResult({ ok: answer.ok, message: answer.message });
      lock.lockFor(null);
      if (!answer.ok) return;
      setTitle('');
      setBody('');
      setMode('all');
      setPickedIds([]);
      // The broadcast is a journal row; recipients see it on their next notifications poll.
      void queryClient.invalidateQueries({ queryKey: qk('developer', 'getJournal') });
    },
    onError: (error) => {
      setResult({ ok: false, message: errorText(error, m.common.errors.generic) });
      lock.lockFor(error);
    },
  });

  const submit = () => {
    setConfirming(false);
    send.mutate();
  };

  return (
    <Card testID="panel-broadcast">
      <View style={styles.form}>
        <TextField
          label={t.titleLabel}
          value={title}
          onChangeText={setTitle}
          maxLength={BROADCAST_TITLE_MAX}
          placeholder={t.titlePlaceholder}
          disabled={send.isPending}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => bodyRef.current?.focus()}
          labelAside={<Counter length={title.length} max={BROADCAST_TITLE_MAX} />}
          testID="broadcast-title"
        />
        <TextArea
          ref={bodyRef}
          label={t.bodyLabel}
          value={body}
          onChangeText={setBody}
          maxLength={BROADCAST_BODY_MAX}
          placeholder={t.bodyPlaceholder}
          disabled={send.isPending}
          helper={t.bodyHint}
          labelAside={<Counter length={body.length} max={BROADCAST_BODY_MAX} />}
          testID="broadcast-body"
        />

        <View style={styles.recipients}>
          <View style={styles.recipientsLabel}>
            <Text variant="label">{t.recipientsLabel}</Text>
            {/* Field sub-labels of the panel are always shown on the site (not hideable hints). */}
            <Text variant="caption">{t.recipientsHint}</Text>
          </View>
          <Segmented<BroadcastMode>
            options={[
              { value: 'all', label: t.all },
              { value: 'selected', label: t.selected },
            ]}
            value={mode}
            onChange={setMode}
            accessibilityLabel={t.recipientsAria}
            disabled={send.isPending}
            fill
            testID="broadcast-mode"
          />

          {mode === 'all' ? (
            <Text variant="small" color="textMuted" testID="broadcast-all-hint">
              {format(t.allHint, { n: students.length })}
            </Text>
          ) : (
            <View style={styles.selected}>
              {picked.length > 0 ? (
                <View style={styles.chips} accessibilityRole="list">
                  {picked.map((student) => (
                    <View key={student.id} style={styles.chip} testID={`broadcast-picked-${student.id}`}>
                      <Text variant="smallStrong" numberOfLines={1} style={styles.chipName}>
                        {student.name}
                      </Text>
                      <IconButton
                        icon="close"
                        variant="danger"
                        accessibilityLabel={format(t.remove, { name: student.name })}
                        onPress={() => setPickedIds((ids) => toggleRecipient(ids, student.id))}
                        disabled={send.isPending}
                        testID={`broadcast-remove-${student.id}`}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
              <Text variant="small" color="textMuted" testID="broadcast-picked-count">
                {picked.length > 0 ? format(t.picked, { n: picked.length }) : t.nonePicked}
              </Text>
              <Button
                label={m.developer.broadcast.pickStudents}
                variant="outline"
                leftIcon="users"
                onPress={() => setPickerOpen(true)}
                disabled={send.isPending}
                testID="broadcast-pick"
              />
            </View>
          )}
        </View>

        <View style={styles.submit}>
          <Button
            label={send.isPending ? t.sending : t.send}
            size="lg"
            loading={send.isPending}
            disabled={!canSubmitBroadcast(title) || lock.seconds > 0}
            // SPEC-GAP: the site sends without asking. A notification to every student cannot be recalled,
            // so the "all" mode asks first (07 §7 item 12); a hand-picked list is its own confirmation.
            onPress={mode === 'all' ? () => setConfirming(true) : submit}
            fullWidth
            testID="broadcast-send"
          />
          {send.isPending ? null : <ResultLine result={result} testID="broadcast-result" />}
          <RetryWaitLine seconds={lock.seconds} testID="broadcast-wait" />
        </View>
      </View>

      <RecipientsSheet
        visible={pickerOpen}
        students={students}
        pickedIds={pickedIds}
        onToggle={(id) => setPickedIds((ids) => toggleRecipient(ids, id))}
        onClose={() => setPickerOpen(false)}
      />
      <Dialog
        visible={confirming}
        tone="default"
        kicker={dict.topics.widgets.confirm.kicker}
        title={m.developer.broadcast.confirmTitle}
        description={format(m.developer.broadcast.confirmBody, { n: students.length })}
        // The site's «Отправить уведомление» does not fit half a dialog on a phone.
        confirmLabel={m.developer.broadcast.confirmSend}
        cancelLabel={m.common.actions.cancel}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
        testID="broadcast-confirm"
      />
    </Card>
  );
}

/** «37 / 120» on the label row: the limit is otherwise invisible until the keyboard stops typing. */
function Counter({ length, max }: { length: number; max: number }) {
  const { m } = useI18n();
  return (
    <Text variant="caption" tabular color={length >= max ? 'yellowText' : 'textMuted'}>
      {format(m.developer.broadcast.counter, { n: length, max })}
    </Text>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.space.field },
  recipients: { gap: t.space.md },
  recipientsLabel: { gap: 2 },
  selected: { gap: t.space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.xs,
    maxWidth: '100%',
    minHeight: 36,
    paddingLeft: t.space.md,
    paddingRight: t.space.xxs,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  chipName: { flexShrink: 1 },
  submit: { gap: t.space.sm },
}));
