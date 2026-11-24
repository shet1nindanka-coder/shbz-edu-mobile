import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { isApiError, useApi } from '@/api';
import { normalizeUserName } from '@/domain/account-validation';
import { MAX_USER_NAME_LENGTH } from '@/domain/text';
import { format, useI18n } from '@/i18n';
import { Hint, useCurrentUser, useSession } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, CopyRow, Notice, SectionCard, Text, TextField } from '@/ui';

type Result = { tone: 'success' | 'error'; text: string } | null;

/**
 * "Personal information" (docs/spec/01-shell-auth.md §1.5 item 4, §3.3): the display name can be
 * changed; the login is read-only and copies on tap. The name is validated like the server does
 * (one line, 1..120 characters) before anything is sent.
 */
export function ProfileSection() {
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.settings;
  const user = useCurrentUser();
  const { applyUser } = useSession();
  const [name, setName] = useState(user.name);
  const [result, setResult] = useState<Result>(null);

  // Set before the request and cleared when it settles: `isPending` read in a handler is the last render's
  // value, so a second submit (return key + button) in the same frame would pass it.
  const inFlight = useRef(false);
  const save = useMutation({
    mutationFn: (value: string) => api.shell.updateProfile({ name: value }),
    onSuccess: ({ user: updated }) => {
      applyUser(updated);
      setName(updated.name);
      setResult({ tone: 'success', text: t.notices.infoUpdated });
    },
    onError: (error) => {
      setResult({ tone: 'error', text: isApiError(error) ? error.message : m.common.errors.generic });
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const submit = () => {
    if (inFlight.current) return;
    const normalized = normalizeUserName(name);
    if (normalized === null) {
      setResult({ tone: 'error', text: t.notices.infoInvalid });
      return;
    }
    setResult(null);
    inFlight.current = true;
    save.mutate(normalized);
  };

  const copy = dict.topics.widgets.copy;

  return (
    <SectionCard title={t.personalInfo}>
      <View style={styles.form}>
        {result ? (
          <View accessibilityLiveRegion="polite">
            <Notice tone={result.tone} text={result.text} testID="settings-profile-notice" />
          </View>
        ) : null}
        <TextField
          label={t.name}
          value={name}
          onChangeText={setName}
          maxLength={MAX_USER_NAME_LENGTH}
          autoComplete="name"
          textContentType="name"
          returnKeyType="done"
          onSubmitEditing={submit}
          testID="settings-name"
        />
        <CopyRow
          label={t.loginLabel}
          value={user.email}
          copiedLabel={copy.copied}
          copiedAnnouncement={format(copy.copiedAria, { label: t.loginCopyLabel })}
          hint={copy.title}
          testID="settings-login"
        />
        <View style={styles.actions}>
          <Button
            label={save.isPending ? m.common.states.saving : dict.common.save}
            onPress={submit}
            loading={save.isPending}
            style={styles.button}
            testID="settings-save-name"
          />
          <Hint>
            <Text variant="hint" style={styles.hint}>
              {t.nameHint}
            </Text>
          </Hint>
        </View>
      </View>
    </SectionCard>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.space.field },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.md },
  button: { alignSelf: 'flex-start' },
  hint: { flexShrink: 1 },
}));
