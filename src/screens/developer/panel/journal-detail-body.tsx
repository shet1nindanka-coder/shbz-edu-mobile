import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { JournalEntry } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Button, Card, Chip, Text } from '@/ui';

import { costText, metaJson, tokensText, whoText } from './journal-logic';

export type JournalDetailBodyProps = {
  entry: JournalEntry;
  /** «История статуса» of a `progress.status` row. */
  onOpenHistory: (ref: NonNullable<JournalEntry['progressRef']>) => void;
};

/**
 * Everything the journal knows about one row (07 §1.10): the columns of the site's table, the system
 * action name, the whole error, `meta` as pretty-printed JSON («Детали записи») and, for a
 * `progress.status` row that still names its student and number, the way into the status history. A field
 * that has nothing to say is left out: «Что» when it only repeats the title above, tokens and cost of an
 * entry that spent none. A phone shows it in a sheet, a tablet in the panel next to the list.
 */
export function JournalDetailBody({ entry, onOpenHistory }: JournalDetailBodyProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.journal;
  const mono = { fontFamily: theme.fonts.mono };
  const failed = entry.outcome === 'failed';
  // The summary of most entries is the action's label again — the title of the sheet / panel.
  const summary = entry.summary && entry.summary !== (entry.actionLabel ?? entry.action) ? entry.summary : null;
  const tokens = tokensText(entry);
  const cost = costText(entry.costRub);

  return (
    <View style={styles.content}>
      {failed ? <Chip label={dict.planner.common.error} tone="red" /> : null}
      {entry.error ? (
        <Text variant="body" color="redText" selectable accessibilityRole="alert" testID="journal-detail-error">
          {entry.error}
        </Text>
      ) : null}

      <Field label={t.filters.category}>
        <Text variant="body">{t.categories[entry.category]}</Text>
      </Field>
      <Field label={m.developer.journal.systemName}>
        <Text variant="small" selectable style={mono} testID="journal-detail-action">
          {entry.action}
        </Text>
      </Field>
      <Field label={t.colWhen}>
        {/* The site prints server time, which is Moscow time: say so on a device in another zone. */}
        <Text variant="body" tabular>{`${formatDateTime(entry.createdAt, locale)} ${m.common.dateTime.msk}`}</Text>
      </Field>
      <Field label={t.colWho}>
        <Text variant="body">{whoText(entry, t.roles)}</Text>
      </Field>
      {entry.progressTarget || summary ? (
        <Field label={t.colWhat}>
          {entry.progressTarget ? <Text variant="bodyStrong">{entry.progressTarget}</Text> : null}
          {summary ? (
            <Text variant="body" selectable>
              {summary}
            </Text>
          ) : null}
        </Field>
      ) : null}
      {tokens !== null || cost !== null ? (
        <View style={styles.pair}>
          <Field label={t.colTokens} style={styles.half}>
            <Text variant="body" tabular>
              {tokens ?? '—'}
            </Text>
          </Field>
          <Field label={t.colCost} style={styles.half}>
            <Text variant="body" tabular>
              {cost ?? '—'}
            </Text>
          </Field>
        </View>
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
          <Card>
            <Text variant="small" color="label" selectable style={mono} testID="journal-detail-meta">
              {metaJson(entry.meta)}
            </Text>
          </Card>
        </Field>
      ) : null}
    </View>
  );
}

function Field({ label, style, children }: { label: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={[styles.field, style]}>
      <Text variant="small" color="textMuted">
        {label}
      </Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md },
  field: { gap: t.space.xxxs },
  pair: { flexDirection: 'row', gap: t.space.md },
  half: { flex: 1 },
}));
