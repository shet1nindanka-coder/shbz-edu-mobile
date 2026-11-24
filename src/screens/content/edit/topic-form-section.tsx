import { useRef } from 'react';
import { View, type TextInputInstance } from 'react-native';

import type { TopicDetail } from '@/api/types';
import type { ViewerFile } from '@/components/files';
import { RetryWaitLine } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { TextArea, TextField } from '@/ui';

import { NumbersField } from '../shared/numbers-field';

import { TopicFileField } from './topic-file-field';
import type { EditNotice, TopicEditForm } from './use-topic-edit-form';

export type TopicFormSectionProps = {
  topic: TopicDetail['topic'];
  form: TopicEditForm;
  onOpenFile: (file: ViewerFile, title: string) => void;
  onNotice: (notice: EditNotice | null) => void;
};

/**
 * The topic's form (docs/spec/07-developer-content.md §1.3 item 4; layout: the `D-topic-edit` mockup):
 * the title, the description, the numbers field that replaces the whole set on save, and the two files as
 * boxes that open their own sheet. No card title and no «Файлы» caption (§1a): the fields and the boxes
 * name themselves. Rendered inside one card; the save button belongs to the screen.
 */
export function TopicFormSection({ topic, form, onOpenFile, onNotice }: TopicFormSectionProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.topics.edit;
  const locked = form.phase !== 'idle';
  // «Далее» on the title moves to the description instead of closing the keyboard.
  const descriptionRef = useRef<TextInputInstance>(null);

  return (
    <View style={styles.root} testID="edit-form">
      <TextField
        label={t.titleLabel}
        value={form.values.title}
        onChangeText={form.setTitle}
        error={form.missing === 'title' ? m.content.edit.titleRequired : null}
        disabled={locked}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => descriptionRef.current?.focus()}
        testID="edit-title"
      />
      <TextArea
        ref={descriptionRef}
        // «Описание» without the site's «— необязательно»: an empty optional field explains itself.
        label={dict.topics.createForm.descriptionLabel}
        value={form.values.description}
        onChangeText={form.setDescription}
        numberOfLines={3}
        disabled={locked}
        testID="edit-description"
      />
      <NumbersField
        value={form.values.numbers}
        onChangeText={form.setNumbers}
        rows={5}
        disabled={locked}
        error={form.missing === 'numbers' ? m.content.edit.numbersRequired : null}
        testID="edit-numbers"
      />

      <View style={styles.files} accessibilityLabel={t.files}>
        {/* One bucket for both boxes, so the wait is shown once, above them. */}
        <RetryWaitLine seconds={form.uploadWait.seconds} testID="edit-upload-wait" />
        <View style={styles.boxes}>
          <TopicFileField
            kind="theory"
            topicId={topic.id}
            file={topic.theoryFile}
            slot={form.theory}
            disabled={locked}
            uploadsLimited={form.uploadWait.waiting}
            onOpen={onOpenFile}
            onNotice={onNotice}
          />
          <TopicFileField
            kind="homework"
            topicId={topic.id}
            file={topic.homeworkFile}
            slot={form.homework}
            disabled={locked}
            uploadsLimited={form.uploadWait.waiting}
            onOpen={onOpenFile}
            onNotice={onNotice}
          />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.lg },
  files: { gap: t.space.xs },
  boxes: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
}));
