import { Platform, Share, View } from 'react-native';

import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Button, Enter, Icon, isOverlayCovered, PressableScale, Text, useCopyFeedback, useEventAnnouncement } from '@/ui';

import { buildCredentialLines, credentialsMessage, type CredentialLine } from './credentials-message';
import { SITE_HOST } from './site-host';
import { useLatched } from './use-latched';

/** What the sheet shows; exists only in memory, between the create call and «Готово». */
export type CreatedCredentials = { name: string; login: string; password: string };

export type CredentialsSheetProps = {
  /** The new account; `null` closes the sheet. */
  credentials: CreatedCredentials | null;
  /** Heading, e.g. `dict.students.createForm.createdTitle`. */
  title: string;
  /**
   * «Готово»: the only way the sheet ends. Leaving the screen (a reminder tap) only hides the sheet's
   * window; the owner keeps `credentials` and the sheet comes back when the screen is focused again.
   */
  onDone: () => void;
};

const WHOLE_MESSAGE = 'all';

const ignoreClose = () => undefined;

/** The system share sheet exists on a device; in a browser only where `navigator.share` does. */
function canShare(): boolean {
  if (Platform.OS !== 'web') return true;
  const browser = (globalThis as { navigator?: { share?: unknown } }).navigator;
  return typeof browser?.share === 'function';
}

/**
 * Shown once after an account is created (docs/spec/04-teacher-students.md D1): site, login and password
 * as the message the teacher passes on. Each line copies its own value; «Скопировать» copies the whole
 * message; «Поделиться» hands it to a messenger. After «Готово» the password cannot be shown again —
 * only replaced — so the sheet ignores the backdrop, the drag and the back button, and says so in one line
 * (the site's paragraph and the «Сообщение для передачи» caption are cut, docs/design/glass-over-paper.md
 * §1a).
 */
export function CredentialsSheet({ credentials, title, onDone }: CredentialsSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.students.credentials;
  const shown = useLatched(credentials);
  const { copied, copy } = useCopyFeedback();
  // What was copied is shown by the tick and the «Скопировано» pill; the site's sentence is spoken only.
  const announce = useEventAnnouncement();
  const shareable = canShare();

  const lines = shown
    ? buildCredentialLines(
        { site: t.site, login: t.login, password: t.password },
        { host: SITE_HOST, login: shown.login, password: shown.password },
      )
    : [];
  const message = credentialsMessage(lines);

  const copyLine = async (line: CredentialLine) => {
    if (await copy(line.id, line.value)) announce(format(t.copiedLine, { label: line.label }));
  };

  const copyMessage = async () => {
    if (await copy(WHOLE_MESSAGE, message)) announce(t.copiedMessage);
  };

  // A dismissed share sheet is not an error; a refusal leaves the copy buttons as the way out. Returned to
  // Button, so the press lock lasts until the sheet is closed (no second sheet on a double tap).
  // Never presented while the app lock covers the sheet: the system sheet would open above the cover with
  // the password in it (iOS hand-off).
  const share = () => (isOverlayCovered() ? Promise.resolve(undefined) : Share.share({ message }).catch(() => undefined));

  return (
    <BottomSheet
      visible={credentials !== null}
      // With `dismissible={false}` the sheet is asked to close only when its screen loses focus (a reminder
      // tap). That must not end it: the password exists nowhere else. BottomSheet hides its window while the
      // screen is not focused and shows it again on return, so ignoring the request keeps the credentials.
      onClose={ignoreClose}
      closeLabel={t.done}
      showClose={false}
      // SPEC-GAP: the site's dialog closes on an overlay click; on a phone a stray tap or drag would throw
      // away a password that exists nowhere else, so only «Готово» closes it.
      dismissible={false}
      testID="credentials-sheet"
      footer={
        <View style={styles.actions}>
          <Button
            label={copied === WHOLE_MESSAGE ? t.copied : t.copy}
            size="lg"
            leftIcon={copied === WHOLE_MESSAGE ? 'check' : 'copy'}
            onPress={copyMessage}
            // The main action takes its own row («Скопировано» is long); «Поделиться» and «Готово» share the next.
            style={[styles.action, styles.actionWide]}
            testID="credentials-copy"
          />
          {shareable ? (
            <Button
              label={m.common.actions.share}
              variant="outline"
              size="lg"
              leftIcon="share"
              onPress={share}
              style={styles.action}
              testID="credentials-share"
            />
          ) : null}
          <Button label={t.done} variant="outline" size="lg" onPress={onDone} style={styles.action} testID="credentials-done" />
        </View>
      }
    >
      {shown ? (
        <View style={styles.content}>
          <View style={styles.intro}>
            <Text variant="dialogTitle" accessibilityRole="header">
              {title}
            </Text>
            {/* The one thing that cannot be undone here: said once, in one line. */}
            <Text variant="small" color="textMuted" accessibilityLabel={format(t.intro, { name: shown.name })}>
              {m.teacher.students.passwordOnce}
            </Text>
          </View>

          <View style={styles.message} accessibilityLabel={t.messageTitle}>
            {lines.map((line) => (
              <CredentialRow
                key={line.id}
                line={line}
                copied={copied === line.id || copied === WHOLE_MESSAGE}
                showPill={copied === line.id}
                copiedLabel={t.copied}
                hint={m.teacher.students.copyHint}
                onCopy={copyLine}
              />
            ))}
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

type CredentialRowProps = {
  line: CredentialLine;
  /** The row is part of what was just copied: the icon turns into a tick. */
  copied: boolean;
  /** This very line was copied: the «Скопировано» pill rises over it. */
  showPill: boolean;
  copiedLabel: string;
  hint: string;
  onCopy: (line: CredentialLine) => void;
};

/** One line of the message: «Логин: maria@example.com» — a tap copies the value only. */
function CredentialRow({ line, copied, showPill, copiedLabel, hint, onCopy }: CredentialRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${line.label}: ${line.value}`}
        accessibilityHint={hint}
        onPress={() => onCopy(line)}
        scaleTo={1}
        pressedStyle={styles.rowPressed}
        style={styles.row}
        testID={`credentials-line-${line.id}`}
      >
        <Text variant="mono" color="textMuted" selectable={false} style={styles.rowText}>
          {`${line.label}: `}
          <Text variant="mono" color="textStrong" selectable={false}>
            {line.value}
          </Text>
        </Text>
        <View style={copied ? null : styles.icon}>
          <Icon name={copied ? 'check' : 'copy'} size={theme.sizes.icon.sm} color={copied ? 'greenText' : 'textStrong'} />
        </View>
      </PressableScale>
      {showPill ? (
        <Enter duration={theme.motion.duration.copyPillIn} offset={theme.space.xxs} style={[styles.pill, theme.shadows.pill]}>
          <Text variant="captionBold" color="tabActiveText" numberOfLines={1}>
            {copiedLabel}
          </Text>
        </Enter>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg, paddingTop: t.space.xxs },
  intro: { gap: t.space.xs },
  message: {
    // A soft panel inside the sheet.
    borderRadius: t.radii.lg,
    backgroundColor: t.colors.softBg,
    paddingVertical: t.space.xs,
    paddingHorizontal: t.space.sm,
  },
  row: {
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: t.space.xs,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radii.md,
  },
  rowPressed: { backgroundColor: t.colors.accentSoftStrong },
  rowText: { flex: 1, minWidth: 0 },
  icon: { opacity: 0.55 },
  pill: {
    position: 'absolute',
    right: t.space.sm,
    top: -t.space.md,
    paddingVertical: t.space.xxs,
    paddingHorizontal: t.space.md,
    borderRadius: t.radii.full,
    backgroundColor: t.colors.tabActiveBg,
    pointerEvents: 'none',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  action: { flexGrow: 1, flexBasis: '30%' },
  actionWide: { flexBasis: '100%' },
}));
