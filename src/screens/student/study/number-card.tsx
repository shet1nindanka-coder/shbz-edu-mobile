import { View } from 'react-native';

import type { StudentNumberDetailResponse } from '@/api/types';
import { MathContent } from '@/components/math';
import { statusLabel } from '@/components/numbers';
import { homeworkStatusLabel } from '@/domain/statuses';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Card, StatusBadge, Text } from '@/ui';

import { NoteField } from './note-field';

export type NumberCardProps = {
  detail: StudentNumberDetailResponse;
  /** The note field got the focus. */
  onNoteFocus?: () => void;
};

/**
 * The card of one problem (site: `StudentSingleNumberCard`, 02 S3): the number with the student's own
 * traffic-light status (read-only — it is set by the AI check or the teacher), the statement, and the
 * personal note. No status picker, no answer, no deadline.
 */
export function NumberCard({ detail, onNoteFocus }: NumberCardProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.student.numberCard;
  const { number } = detail;
  const hasCondition = Boolean(number.conditionLatex && number.conditionLatex.trim());

  return (
    <Card testID="number-card">
      <View style={styles.body}>
        <View style={styles.statusBlock}>
          <View style={styles.titleRow}>
            <Text
              variant="sectionTitle"
              tabular
              accessibilityRole="header"
              accessibilityLabel={format(dict.topics.widgets.numberLabel, { number: number.number })}
              style={styles.title}
              testID="number-card-title"
            >
              {number.number}
            </Text>
            <StatusBadge
              status={number.status}
              label={statusLabel(number.status, m.common.statuses)}
              accessibilityLabel={homeworkStatusLabel(number.status, dict)}
            />
          </View>
          <Hint>
            <Text variant="hint">{t.statusHint}</Text>
          </Hint>
        </View>

        {hasCondition && number.conditionLatex ? (
          <Card accessibilityLabel={t.condition}>
            <MathContent value={number.conditionLatex} testID="number-condition" />
          </Card>
        ) : null}

        {detail.notesEnabled ? (
          <NoteField
            // The draft belongs to one problem: another number starts a fresh editor.
            key={number.id}
            homeworkNumberId={number.id}
            number={number.number}
            serverNote={number.note}
            onFocus={onNoteFocus}
          />
        ) : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.md },
  statusBlock: { gap: t.space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  title: { flex: 1, minWidth: 0 },
}));
