import { useState } from 'react';
import { View } from 'react-native';

import type { JournalEntry } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, Chip, PressableScale, Text, TextButton } from '@/ui';

import { collapseError, costText, tokensText, whoText } from './journal-logic';

export type JournalEntryCardProps = {
  entry: JournalEntry;
  onOpen: (entry: JournalEntry) => void;
};

/**
 * One journal row as a card (07 §1.10 phone mapping): category chip (red when the entry failed) and time
 * (Moscow time, marked «МСК» on every card — 07 §7 item 14 — so it reads right in any device zone),
 * the action's label with its system name, who, what, tokens and cost when present, then the error in
 * red — collapsed behind «полностью» when it is longer than 140 characters. A tap opens the detail sheet.
 */
export function JournalEntryCard({ entry, onOpen }: JournalEntryCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.journal;
  const [expanded, setExpanded] = useState(false);

  const failed = entry.outcome === 'failed';
  const action = entry.actionLabel ?? entry.action;
  const tokens = tokensText(entry);
  const cost = costText(entry.costRub);
  const error = entry.error ? collapseError(entry.error) : null;

  return (
    <Card padded={false} testID={`journal-entry-${entry.id}`}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={format(m.developer.journal.openEntry, { action })}
        onPress={() => onOpen(entry)}
        scaleTo={0.99}
        style={[styles.main, error ? styles.mainWithError : null]}
        testID={`journal-entry-${entry.id}-open`}
      >
        <View style={styles.top}>
          <Chip label={t.categories[entry.category]} tone={failed ? 'red' : 'muted'} />
          <Text variant="caption" tabular style={styles.when}>
            {`${formatDateTime(entry.createdAt, locale)} ${m.common.dateTime.msk}`}
          </Text>
        </View>

        <View style={styles.titles}>
          <Text variant="bodyStrong">{action}</Text>
          {/* The text filter works on the system name, so it stays visible next to its label. */}
          {entry.actionLabel ? (
            <Text variant="caption" style={{ fontFamily: theme.fonts.mono }}>
              {entry.action}
            </Text>
          ) : null}
        </View>

        <Text variant="caption">{whoText(entry, t.roles)}</Text>

        {entry.progressTarget || entry.summary ? (
          <View style={styles.what}>
            {entry.progressTarget ? <Text variant="smallBold">{entry.progressTarget}</Text> : null}
            {entry.summary ? <Text variant="small">{entry.summary}</Text> : null}
          </View>
        ) : null}

        {tokens || cost ? (
          <Text variant="caption" tabular>
            {[tokens ? `${t.colTokens}: ${tokens}` : null, cost ? `${t.colCost}: ${cost}` : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </PressableScale>

      {entry.error && error ? (
        <View style={styles.error}>
          <Text variant="small" color="dangerText" testID={`journal-entry-${entry.id}-error`}>
            {expanded ? entry.error : error.text}
          </Text>
          {error.collapsed ? (
            <TextButton
              label={expanded ? m.developer.journal.collapse : t.fully}
              tone="danger"
              onPress={() => setExpanded((value) => !value)}
              style={styles.fully}
              testID={`journal-entry-${entry.id}-fully`}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  main: { padding: t.space.card, gap: t.space.xs, borderRadius: t.radii.lg },
  mainWithError: { paddingBottom: t.space.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  when: { flexShrink: 1, textAlign: 'right' },
  titles: { gap: 2, marginTop: t.space.xxs },
  what: { gap: 2, marginTop: t.space.xxs },
  error: { paddingHorizontal: t.space.card, paddingBottom: t.space.card, gap: t.space.xxs },
  fully: { alignSelf: 'flex-start' },
}));
