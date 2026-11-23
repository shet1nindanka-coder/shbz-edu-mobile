import { useState } from 'react';

import { mskToday, parseMskDateTimeInput } from '@/domain/moscow-time';
import { useI18n } from '@/i18n';
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
 * never starts and never reaches the students' "Lesson" tab, so the board offers to set its time.
 */
export function ScheduleBanner({ pending, disabled, onSchedule }: ScheduleBannerProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.lessonBoard;
  const labels = useDateTimeLabels();
  const [value, setValue] = useState('');
  const instant = value ? parseMskDateTimeInput(value) : null;

  return (
    <Card style={styles.card} testID="lesson-schedule-banner">
      <Text variant="bodyStrong">{t.noTime}</Text>
      <DateTimeField
        value={value}
        onChange={setValue}
        today={mskToday()}
        placeholder={t.dateTimeAria}
        accessibilityLabel={t.dateTimeAria}
        labels={labels}
        locale={locale}
        helper={m.common.dateTime.moscowTime}
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
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  submit: { alignSelf: 'flex-start' },
}));
