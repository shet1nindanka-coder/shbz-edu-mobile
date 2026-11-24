import { useState } from 'react';
import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Segmented } from '@/ui';

import { ImportPanelView } from '../shared/import-panel';
import { ImportPromptButton } from '../shared/import-prompt-button';
import { useImportPanel } from '../shared/use-import-panel';

import { ManualCreateForm } from './manual-create-form';
import { useManualCreate } from './use-manual-create';

type CreateMode = 'ai' | 'manual';

export type CreateTopicSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Manual create succeeded: the list shows the «created» notice. */
  onCreated: (topicId: string) => void;
  /** An import created a topic: open its edit screen so the files can be attached. */
  onImported: (topicId: string) => void;
};

/**
 * «Новая тема» (the site's «Создать новую тему»; docs/spec/07-developer-content.md §1.1 item 3, §1.4, §1.5) — DEVELOPER only.
 * The site's inline block becomes a sheet opened from the list. Two ways, AI import (default) and the
 * manual form; both keep their state while the other is shown and while the sheet is closed, because
 * the state hooks live here and this component stays mounted.
 */
export function CreateTopicSheet({ visible, onClose, onCreated, onImported }: CreateTopicSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.topics.createSwitch;
  const [mode, setMode] = useState<CreateMode>('ai');
  const manual = useManualCreate(onCreated);
  const importer = useImportPanel({ target: { createTopic: true }, onCreated: onImported });
  const busy = manual.submitting || importer.applying;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      closeLabel={m.common.actions.close}
      title={m.content.list.createAction}
      dismissible={!busy}
      maxHeightRatio={0.94}
      testID="create-topic-sheet"
    >
      <View style={styles.root}>
        <Segmented
          options={[
            // «Импорт»: what the AI way is here — loading the model's reply; «С помощью ИИ» is spoken.
            { value: 'ai', label: m.content.edit.sections.import, accessibilityLabel: t.ai },
            { value: 'manual', label: t.manual },
          ]}
          value={mode}
          onChange={setMode}
          accessibilityLabel={t.aria}
          role="tab"
          fill
          disabled={busy}
          testID="create-switch"
        />
        {mode === 'ai' ? (
          <>
            <ImportPromptButton />
            <ImportPanelView state={importer} hidePromptButton />
          </>
        ) : (
          <ManualCreateForm state={manual} />
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.lg, paddingTop: t.space.xs },
}));
