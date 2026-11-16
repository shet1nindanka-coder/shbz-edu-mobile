import { View } from 'react-native';

import type { StudentNumberDetailResponse } from '@/api/types';
import { MathContent } from '@/components/math';
import { homeworkStatusShortLabel } from '@/domain/statuses';
import { useI18n } from '@/i18n';
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
  const { dict } = useI18n();
  const t = dict.student.numberCard;
  const { number } = detail;
  const hasCondition = Boolean(number.conditionLatex && number.conditionLatex.trim());

  return (
    <Card testID="number-card">
      <View style={styles.body}>
        <View style={styles.statusBlock}>
          <View style={styles.titleRow}>
            <Text variant="sectionTitle" accessibilityRole="header" testID="number-card-title">
              {`№ ${number.number}`}
            </Text>
            <StatusBadge status={number.status} label={homeworkStatusShortLabel(number.status, dict)} />
          </View>
          <Hint>
            <Text variant="hint">{t.statusHint}</Text>
          </Hint>
        </View>

        {hasCondition && number.conditionLatex ? (
          <View style={styles.block}>
            <Text variant="kickerSm">{t.condition}</Text>
            <MathContent value={number.conditionLatex} testID="number-condition" />
          </View>
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
  body: { gap: t.space.field },
  statusBlock: { gap: t.space.xs },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  block: { gap: t.space.xs },
}));
