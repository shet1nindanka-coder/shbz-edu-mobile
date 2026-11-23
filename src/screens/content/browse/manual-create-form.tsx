import { useRef } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { RetryWaitLine } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Notice, Text, TextArea, TextField } from '@/ui';

import { NumbersField } from '../shared/numbers-field';

import { UploadSlotField } from './upload-slot-field';
import type { ManualCreateState } from './use-manual-create';

/** Manual create form: title, optional description, two pre-uploaded files and the numbers field. */
export function ManualCreateForm({ state }: { state: ManualCreateState }) {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.topics.createForm;
  const hint = state.hint === 'uploading' ? t.hintUploading : state.hint === 'ready' ? t.hintReady : t.hintStart;
  // «Далее» on the title moves to the description instead of closing the keyboard.
  const descriptionRef = useRef<TextInputInstance>(null);

  return (
    <View style={styles.root} testID="manual-create-form">
      <TextField
        label={t.titleLabel}
        value={state.title}
        onChangeText={state.setTitle}
        placeholder={t.titlePlaceholder}
        disabled={state.submitting}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => descriptionRef.current?.focus()}
        testID="create-title"
      />
      <TextArea
        ref={descriptionRef}
        label={`${t.descriptionLabel} ${t.optional}`}
        value={state.description}
        onChangeText={state.setDescription}
        placeholder={t.descriptionPlaceholder}
        numberOfLines={3}
        disabled={state.submitting}
        testID="create-description"
      />
      <UploadSlotField label={t.theoryFile} slot={state.theory} disabled={state.submitting || state.uploadWait.waiting} testID="create-theory" />
      <UploadSlotField
        label={t.homeworkFile}
        slot={state.homework}
        disabled={state.submitting || state.uploadWait.waiting}
        testID="create-homework"
      />
      <RetryWaitLine seconds={state.uploadWait.seconds} testID="create-upload-wait" />
      <NumbersField
        value={state.numbers}
        onChangeText={state.setNumbers}
        description={t.numbersDescription}
        rows={4}
        disabled={state.submitting}
        testID="create-numbers"
      />

      {/* A hint on the site (`ui-hint`): hidden with the hints preference; the button's state says the same. */}
      <Hint>
        <Text variant="hint" testID="create-hint">
          {hint}
        </Text>
      </Hint>

      {state.error ? <Notice tone="error" text={state.error} testID="create-error" /> : null}
      <RetryWaitLine seconds={state.createWait.seconds} testID="create-wait" />

      <Button
        label={state.submitting ? t.submitting : t.submit}
        loading={state.submitting}
        disabled={!state.canSubmit}
        onPress={state.submit}
        testID="create-submit"
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.lg },
}));
