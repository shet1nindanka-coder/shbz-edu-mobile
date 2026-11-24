import { useState } from 'react';

import { mskToday, parseMskDateTimeInput } from '@/domain/moscow-time';
import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Card, DateTimeField, Text } from '@/ui';

import { useDateTimeLabels } from '@/components/date-time';

export type ScheduleBannerProps = {
  pending: boolean;
  /** The schedule limit is cooling down. */
  disabled: boolean;
  /** `startsAt` as an ISO instant (read from the Moscow wall clock of the picker). */
  onSchedule: (startsAtIso: string) => void;
};

/**
 * "The lesson has no time" (docs/spec/05-teacher-lessons-plans.md §1.3 banners): an unscheduled lesson
 * never starts and never reaches the students' "Lesson" tab, so the board offers to set its time — a date
 * field named «Дата и время урока, МСК» and its button. Why it matters is a hint (off by default).
 */
export function ScheduleBanner({ pending, disabled, onSchedule }: ScheduleBannerProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.lessonBoard;
  const labels = useDateTimeLabels();
  const [value, setValue] = useState('');
  const instant = value ? parseMskDateTimeInput(value) : null;
  // The one name of the field; the zone is said where a time is entered.
  const name = `${t.dateTimeAria}, ${m.common.dateTime.msk}`;

  return (
    <Card style={styles.card} testID="lesson-schedule-banner">
      <DateTimeField
        value={value}
        onChange={setValue}
        today={mskToday()}
        placeholder={name}
        accessibilityLabel={name}
        labels={labels}
        locale={locale}
        disabled={pending}
        testID="lesson-schedule-value"
      />
      <Button
        label={pending ? t.scheduling : t.schedule}
        variant="outline"
        loading={pending}
        disabled={instant === null || disabled}
        onPress={() => {
          if (instant) onSchedule(instant.toISOString());
        }}
        testID="lesson-schedule-submit"
        style={styles.submit}
      />
      <Hint>
        <Text variant="small" color="textMuted">
          {m.planner.lessonBoard.noTime}
        </Text>
      </Hint>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  submit: { alignSelf: 'flex-start' },
}));
