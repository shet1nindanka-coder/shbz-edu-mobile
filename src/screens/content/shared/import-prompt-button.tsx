import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { qk, useApi } from '@/api';
import { TOPIC_IMPORT_PROMPT } from '@/domain/topic-import-prompt';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, IconButton, isOverlayCovered, Text, useCopyFeedback, useStatusAnnouncement } from '@/ui';

/** The site keeps the "copied" pill for 2 s. */
const COPIED_HOLD_MS = 2000;

/**
 * «Скопировать промпт для ИИ» (docs/spec/07-developer-content.md §1.5.1, §7 Q10): the prompt comes from
 * `GET /topic-import/prompt` so it stays in sync with the server's parser; the bundled copy is the
 * fallback when the request fails (offline). On a phone the natural next step is another app, so the
 * prompt can also be handed to the share sheet.
 */
export function ImportPromptButton({ testID = 'import-prompt-copy' }: { testID?: string }) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.topics.importPrompt;
  const feedback = useCopyFeedback(COPIED_HOLD_MS);
  const copied = feedback.copied !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `busy` reaches the controls one render late: a second tap handled before it would open a second
  // share sheet (IconButton has no press guard). The ref is the synchronous lock.
  const running = useRef(false);
  // Spoken on both platforms: the error text is mounted when it appears, and role="alert" says nothing on Android.
  useStatusAnnouncement(error);

  const loadPrompt = async (): Promise<string> => {
    try {
      return await queryClient.fetchQuery({
        queryKey: qk('content', 'getImportPrompt'),
        queryFn: () => api.content.getImportPrompt(),
        staleTime: 5 * 60 * 1000,
        // One attempt that always runs: with the app defaults an offline request waits for the connection
        // (its retry is parked) and never settles, so the bundled prompt below would never be reached.
        retry: false,
        networkMode: 'always',
      });
    } catch {
      return TOPIC_IMPORT_PROMPT;
    }
  };

  const copy = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!(await feedback.copy('prompt', await loadPrompt()))) setError(m.content.importPanel.clipboardDenied);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const share = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const message = await loadPrompt();
      // The app lock may have covered the screen while the prompt loaded: a system sheet presented now
      // would open above the lock cover (iOS hand-off). The user taps «Share» again after unlocking.
      if (isOverlayCovered()) return;
      await Share.share({ message });
    } catch {
      // The user closed the sheet or sharing is unavailable: copying still works.
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Button
          label={copied ? t.copied : t.copy}
          accessibilityLabel={copied ? m.content.importPanel.promptCopied : t.copy}
          variant="outline"
          size="md"
          leftIcon={copied ? 'check' : 'copy'}
          loading={busy}
          onPress={copy}
          style={styles.copy}
          testID={testID}
        />
        {Platform.OS === 'web' ? null : (
          <IconButton
            icon="share"
            accessibilityLabel={m.content.importPanel.sharePrompt}
            disabled={busy}
            onPress={() => void share()}
            testID="import-prompt-share"
          />
        )}
      </View>
      {error ? (
        <Text variant="caption" color="dangerText" accessibilityRole="alert" testID="import-prompt-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  copy: { flex: 1 },
}));
