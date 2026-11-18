import { View } from 'react-native';

import { META_LIMITS } from '@/api/types/limits';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { IconButton, Text, announceOnIOS } from '@/ui';

import { stepDuration } from './new-lesson-logic';

export type DurationStepperProps = {
  /** Minutes, 15..240. */
  value: number;
  onChange: (value: number) => void;
  /** Accessible name of the control, e.g. «Длительность, минут». */
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
};

const RANGE = META_LIMITS.lessonDurationMinutes;

/**
 * Lesson duration as a stepper: 15…240 minutes in steps of 5 (the site's number input with
 * `min 15 · max 240 · step 5`, docs/spec/05-teacher-lessons-plans.md §1.2.d "Phone").
 */
export function DurationStepper({ value, onChange, accessibilityLabel, disabled = false, testID }: DurationStepperProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const text = format(dict.planner.common.minutesShort, { n: value });
  const valueLabel = (minutes: number) => `${accessibilityLabel}: ${format(dict.planner.common.minutesShort, { n: minutes })}`;
  // The focus stays on the pressed button: Android reads the value's live region, VoiceOver has none and
  // is told the new value explicitly.
  const step = (direction: 1 | -1) => {
    const next = stepDuration(value, direction);
    if (next === value) return;
    onChange(next);
    announceOnIOS(valueLabel(next));
  };
  return (
    <View testID={testID} style={styles.row}>
      <IconButton
        icon="minus"
        accessibilityLabel={m.planner.lessonNew.durationDecrease}
        disabled={disabled || value <= RANGE.min}
        onPress={() => step(-1)}
        testID={testID ? `${testID}-minus` : undefined}
      />
      {/* The two buttons are the controls; the value between them is a live region (Android). */}
      <Text
        variant="bodyStrong"
        tabular
        align="center"
        accessibilityLabel={valueLabel(value)}
        accessibilityLiveRegion="polite"
        style={styles.value}
        testID={testID ? `${testID}-value` : undefined}
      >
        {text}
      </Text>
      <IconButton
        icon="plus"
        accessibilityLabel={m.planner.lessonNew.durationIncrease}
        disabled={disabled || value >= RANGE.max}
        onPress={() => step(1)}
        testID={testID ? `${testID}-plus` : undefined}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: t.space.sm,
    minHeight: t.sizes.minTouch,
  },
  value: { minWidth: 76 },
}));
