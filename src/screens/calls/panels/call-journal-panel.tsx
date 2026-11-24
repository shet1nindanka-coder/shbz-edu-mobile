import { useMemo } from 'react';
import { View } from 'react-native';

import type { ParentCallStudentOverview } from '@/api/types';
import { useI18n } from '@/i18n';
import { useNowTick } from '@/services/clock';
import { makeStyles, useTheme } from '@/theme';
import { EmptyState, Icon, Panel, Text } from '@/ui';

import { buildCallJournal } from '../logic';
import { CallHistoryEntry } from '../sheets/call-history';

export type CallJournalPanelProps = {
  students: readonly ParentCallStudentOverview[];
  weight?: number;
  /** DEVELOPER: who made each call is named. */
  showTeacher: boolean;
};

/**
 * The right panel of the read-only tablet screen (the developer): the latest calls of every student in
 * one journal, newest first, built from the histories the overview already carries. The lock says what
 * the comments are — personal data, read here by the developer only.
 */
export function CallJournalPanel({ students, weight, showTeacher }: CallJournalPanelProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();
  const journal = useMemo(() => buildCallJournal(students), [students]);
  // Coarse: only the year of «now» matters to an entry (a call of an earlier year shows its year).
  const now = useNowTick(3_600_000);

  return (
    <Panel
      weight={weight}
      header={
        <View style={styles.title}>
          <Icon name="lock" size={theme.sizes.icon.md} color="textMuted" />
          <Text variant="sectionTitle" accessibilityRole="header" style={styles.titleText}>
            {m.calls.journal.title}
          </Text>
        </View>
      }
      contentStyle={styles.content}
      testID="calls-journal"
    >
      {journal.length === 0 ? (
        <EmptyState variant="plain" title={m.calls.journal.empty} testID="calls-journal-empty" />
      ) : (
        journal.map(({ entry, studentName }, index) => (
          <CallHistoryEntry
            key={entry.id}
            entry={entry}
            now={now}
            studentName={studentName}
            showTeacher={showTeacher}
            divider={index < journal.length - 1}
          />
        ))
      )}
    </Panel>
  );
}

const useStyles = makeStyles((t) => ({
  title: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  titleText: { flex: 1, minWidth: 0 },
  // The entries bring their own vertical padding and hairlines.
  content: { gap: 0 },
}));
