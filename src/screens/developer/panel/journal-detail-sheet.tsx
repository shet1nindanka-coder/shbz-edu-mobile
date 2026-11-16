import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { JournalEntry } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Button, Card, Chip, Text } from '@/ui';

import { costText, metaJson, tokensText, whoText } from './journal-logic';

export type JournalDetailSheetProps = {
  /** The entry to show; kept by the caller while the sheet slides away. */
  entry: JournalEntry | null;
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void;
  /** «История статуса» of a `progress.status` row. */
  onOpenHistory: (ref: NonNullable<JournalEntry['progressRef']>) => void;
};

/**
 * Detail of a journal row (07 §1.10 phone mapping): every column of the site's table, the system action
 * name, the whole error, `meta` as pretty-printed JSON («Детали записи») and, for a `progress.status` row
 * that still names its student and number, the way into the status history.
 */
export function JournalDetailSheet({ entry, visible, onClose, onClosed, onOpenHistory }: JournalDetailSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.journal;
  const mono = { fontFamily: theme.fonts.mono };

  return (
    <BottomSheet
      visible={visible && entry !== null}
      onClose={onClose}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={entry ? (entry.actionLabel ?? entry.action) : undefined}
      testID="journal-detail-sheet"
    >
      {entry ? (
        <View style={styles.content}>
          <View style={styles.chips}>
            <Chip label={t.categories[entry.category]} tone={entry.outcome === 'failed' ? 'red' : 'muted'} />
          </View>

          <Field label={m.developer.journal.systemName}>
            <Text variant="small" selectable style={mono} testID="journal-detail-action">
              {entry.action}
            </Text>
          </Field>
          <Field label={t.colWhen}>
            {/* The site prints server time, which is Moscow time: say so on a device in another zone. */}
            <Text variant="small" tabular>{`${formatDateTime(entry.createdAt, locale)} ${m.common.dateTime.msk}`}</Text>
          </Field>
          <Field label={t.colWho}>
            <Text variant="small">{whoText(entry, t.roles)}</Text>
          </Field>
          <Field label={t.colWhat}>
            {entry.progressTarget ? <Text variant="smallBold">{entry.progressTarget}</Text> : null}
            <Text variant="small" selectable>
              {entry.summary ?? (entry.progressTarget ? '' : '—')}
            </Text>
          </Field>
          <View style={styles.pair}>
            <Field label={t.colTokens} style={styles.half}>
              <Text variant="small" tabular>
                {tokensText(entry) ?? '—'}
              </Text>
            </Field>
            <Field label={t.colCost} style={styles.half}>
              <Text variant="small" tabular>
                {costText(entry.costRub) ?? '—'}
              </Text>
            </Field>
          </View>

          {entry.error ? (
            <Text variant="small" color="dangerText" selectable accessibilityRole="alert" testID="journal-detail-error">
              {entry.error}
            </Text>
          ) : null}

          {entry.progressRef ? (
            <Button
              label={dict.topics.history.show}
              variant="outline"
              leftIcon="clock"
              onPress={() => entry.progressRef && onOpenHistory(entry.progressRef)}
              testID="journal-detail-history"
            />
          ) : null}

          {entry.meta ? (
            <Field label={t.details}>
              <Card variant="soft" padded={14}>
                <Text variant="caption" color="label" selectable style={mono} testID="journal-detail-meta">
                  {metaJson(entry.meta)}
                </Text>
              </Card>
            </Field>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

function Field({ label, style, children }: { label: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={[styles.field, style]}>
      <Text variant="kickerSm">{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md, paddingTop: t.space.xs },
  chips: { flexDirection: 'row', gap: t.space.xs },
  field: { gap: 3 },
  pair: { flexDirection: 'row', gap: t.space.md },
  half: { flex: 1 },
}));
