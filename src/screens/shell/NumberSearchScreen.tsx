import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { hasErrorCode, isApiError, isNetworkError, useApi } from '@/api';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { numberFindTarget } from '@/navigation/targets';
import { Hint, useCurrentUser } from '@/providers';
import { makeStyles } from '@/theme';
import { AppBar, IconButton, Screen, SearchField, Text } from '@/ui';

const DIGITS_ONLY = /^\d+$/;
const ALL_ZEROS = /^0+$/;
/** `GET /numbers/find` accepts at most 20 digits. */
const MAX_DIGITS = 20;

/**
 * `shell.numberSearch` (docs/spec/01-shell-auth.md §1.5.4, §3.9; 90-addendum-2 N5): one field, digits
 * only. The number is sent as typed — leading zeros are significant in the recorded spelling, the server
 * matches the normalised form. A hit opens the number's card of the current role; a miss shows the
 * server's text, or the generic "not found" line when there is none.
 */
export function NumberSearchScreen() {
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.numberSearch;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<TextInputInstance>(null);

  // The field is disabled while a search runs, which drops the focus (and the keyboard): after a miss the
  // user corrects the number right away, so the focus comes back.
  const refocus = () => setTimeout(() => input.current?.focus(), 0);

  // Set before the request and cleared when it settles: `isPending` read in a handler is the last render's
  // value, so a second submit (return key + button) in the same frame would pass it.
  const inFlight = useRef(false);
  const search = useMutation({
    mutationFn: (number: string) => api.shell.findNumber(number),
    onSuccess: (result) => {
      const target = numberFindTarget(result, user.role);
      if (!target || !navigation.open(target)) {
        setError(t.notFound);
        refocus();
      }
    },
    onError: (failure) => {
      // A validation or lookup answer carries its own text; anything else is the site's generic line.
      const useServerText = isApiError(failure) && !isNetworkError(failure) && hasErrorCode(failure, 'invalidNumber', 'numberNotFound', 'rateLimited');
      setError(useServerText ? failure.message : isNetworkError(failure) ? failure.message : t.notFound);
      refocus();
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const submit = (raw: string) => {
    if (inFlight.current) return;
    // Also the empty field: that is what is left after typing letters, which are stripped (01 §1.5.4).
    if (!DIGITS_ONLY.test(raw) || ALL_ZEROS.test(raw)) {
      setError(t.invalid);
      return;
    }
    setError(null);
    inFlight.current = true;
    search.mutate(raw);
  };

  return (
    <Screen
      testID="number-search-screen"
      header={
        <AppBar
          title={m.shell.numberSearch.title}
          right={
            <IconButton icon="close" variant="ghost" accessibilityLabel={m.common.actions.close} onPress={navigation.back} testID="number-search-close" />
          }
        />
      }
    >
      <View style={styles.block}>
        <SearchField
          ref={input}
          value={value}
          onChangeText={(text) => {
            // Non-digits are stripped while typing, as on the site.
            setValue(text.replace(/\D+/g, '').slice(0, MAX_DIGITS));
            if (error) setError(null);
          }}
          onSubmit={submit}
          submitLabel={t.submit}
          placeholder={search.isPending ? t.searching : t.placeholder}
          accessibilityLabel={t.aria}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={MAX_DIGITS}
          autoFocus
          disabled={search.isPending}
          busy={search.isPending}
          error={error}
          testID="number-search-input"
        />
        <Hint>
          <Text variant="hint">{m.shell.numberSearch.hint}</Text>
        </Hint>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.md },
}));
