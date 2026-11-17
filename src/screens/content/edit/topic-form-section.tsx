import { useRef } from 'react';
import { View, type TextInputInstance } from 'react-native';

import type { TopicDetail } from '@/api/types';
import type { ViewerFile } from '@/components/files';
import { RetryWaitLine } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Text, TextArea, TextField } from '@/ui';

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
 * The topic's form (docs/spec/07-developer-content.md §1.3 item 4): basic information, the numbers field
 * that replaces the whole set on save, and the two files. The save button is the screen's sticky footer.
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
      <Card style={styles.block}>
        <Text variant="cardTitle" accessibilityRole="header">
          {t.basicInfo}
        </Text>
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
          label={t.descriptionLabel}
          value={form.values.description}
          onChangeText={form.setDescription}
          numberOfLines={3}
          disabled={locked}
          testID="edit-description"
        />
      </Card>

      <Card style={styles.block}>
        <Text variant="cardTitle" accessibilityRole="header">
          {t.numbers}
        </Text>
        <NumbersField
          value={form.values.numbers}
          onChangeText={form.setNumbers}
          description={t.numbersDescription}
          rows={5}
          disabled={locked}
          error={form.missing === 'numbers' ? m.content.edit.numbersRequired : null}
          testID="edit-numbers"
        />
      </Card>

      <View style={styles.block}>
        <Text variant="cardTitle" accessibilityRole="header">
          {t.files}
        </Text>
        {/* One bucket for both cells, so the wait is shown once, above them. */}
        <RetryWaitLine seconds={form.uploadWait.seconds} testID="edit-upload-wait" />
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
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.lg },
  block: { gap: t.space.field },
}));
