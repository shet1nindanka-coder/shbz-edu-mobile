import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Pressable, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError, useApi } from '@/api';
import { useI18n } from '@/i18n';
import { useAppNavigation, useStillHere } from '@/navigation';
import { numberFindTarget } from '@/navigation/targets';
import { Hint, useCurrentUser } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { IconButton, SearchField, SurfaceScope, Text } from '@/ui';

const DIGITS_ONLY = /^\d+$/;
const ALL_ZEROS = /^0+$/;
/** `GET /numbers/find` accepts at most 20 digits. */
const MAX_DIGITS = 20;

/**
 * `shell.numberSearch` (docs/spec/01-shell-auth.md §1.5.4, §3.9; 90-addendum-2 N5): the search panel that
 * drops from the top of the screen when the round search button of a header is pressed
 * (docs/design/glass-over-paper.md §5) — one field, digits only, and a close mark; the dimmed screen under
 * it closes the panel too. The number is sent as typed — leading zeros are significant in the recorded spelling, the server
 * matches the normalised form. A hit opens the number's card of the current role; a miss shows the
 * server's text, or the generic "not found" line when there is none.
 */
export function NumberSearchScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.numberSearch;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  // A search the user closed (×, back, swipe-down) is abandoned: its answer must not open a number over
  // whatever they went to, nor pop an overlay they opened since (`navigateTo` closes the overlay on top).
  const stillHere = useStillHere();
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
      if (!stillHere()) return;
      const target = numberFindTarget(result, user.role);
      if (!target || !navigation.open(target)) {
        setError(t.notFound);
        refocus();
      }
    },
    onError: (failure) => {
      if (!stillHere()) return;
      setError(numberSearchErrorText(failure, t.notFound));
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
    <View testID="number-search-screen" style={styles.layer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={m.common.actions.close}
        focusable={false}
        onPress={navigation.back}
        style={styles.backdrop}
      />
      <View style={[styles.panel, theme.shadows.popover, { marginTop: insets.top + theme.space.sm }]} accessibilityViewIsModal>
        <SurfaceScope>
          <View style={styles.row}>
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
              style={styles.field}
              testID="number-search-input"
            />
            <IconButton icon="close" accessibilityLabel={m.common.actions.close} onPress={navigation.back} testID="number-search-close" />
          </View>
          <Hint>
            <Text variant="hint">{m.shell.numberSearch.hint}</Text>
          </Hint>
        </SurfaceScope>
      </View>
    </View>
  );
}

/**
 * The line under the field for a failed search. Like the site (`setFeedback(result?.error ?? t.notFound)`),
 * every refusal shows the server's own text — 503 / 500 searchFailed / 403 must not read as "this number
 * does not exist" — and the generic "not found" line is only for a failure without a text.
 */
export function numberSearchErrorText(failure: unknown, notFound: string): string {
  return isApiError(failure) && failure.message.trim() !== '' ? failure.message : notFound;
}

const useStyles = makeStyles((t) => ({
  layer: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: t.colors.overlay },
  panel: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: t.sizes.dialogMaxWidth + t.space.gutter * 2,
    marginHorizontal: t.space.gutter,
    padding: t.space.md,
    gap: t.space.sm,
    borderRadius: t.radii.xl,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.cardBorder,
    backgroundColor: t.colors.cardBg,
  },
  // The error line hangs under the field, so the close mark stays level with the field itself.
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
  field: { flex: 1, alignSelf: 'auto' },
}));
