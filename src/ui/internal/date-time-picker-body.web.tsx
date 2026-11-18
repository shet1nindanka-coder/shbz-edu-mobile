import type { CSSProperties } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Text } from '../text';
import { currentToday, parseDateTimeValue, withPickedDate, withPickedTime } from './date-time';
import type { DateTimePickerBodyProps } from './date-time-picker-body';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Web fallback of the picker body: the browser's own date and time inputs, themed. The native module
 * `@react-native-community/datetimepicker` has no web implementation.
 */
export function DateTimePickerBody({ value, today, onChange, dateLabel, timeLabel }: DateTimePickerBodyProps) {
  const theme = useTheme();
  const styles = useStyles();
  const parts = parseDateTimeValue(value);
  const input: CSSProperties = {
    width: '100%',
    height: theme.sizes.dateTrigger,
    boxSizing: 'border-box',
    padding: '0 14px',
    borderRadius: theme.radii.md,
    border: `${theme.borders.interactive}px solid ${theme.colors.inputBorder}`,
    background: theme.colors.inputBg,
    color: theme.colors.textStrong,
    colorScheme: theme.name,
    accentColor: theme.colors.accentSolid,
    fontFamily: theme.fonts.medium,
    fontSize: 16,
  };

  return (
    <View style={styles.rows}>
      <View style={styles.field}>
        <Text variant="kickerSm">{dateLabel}</Text>
        <input
          type="date"
          aria-label={dateLabel}
          style={input}
          value={parts ? `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}` : ''}
          onChange={(event) => {
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.target.value);
            if (match) onChange(withPickedDate(value, Number(match[1]), Number(match[2]), Number(match[3])));
          }}
        />
      </View>
      <View style={styles.field}>
        <Text variant="kickerSm">{timeLabel}</Text>
        <input
          type="time"
          aria-label={timeLabel}
          style={input}
          value={parts ? `${pad(parts.hour)}:${pad(parts.minute)}` : ''}
          onChange={(event) => {
            const match = /^(\d{2}):(\d{2})/.exec(event.target.value);
            if (match) onChange(withPickedTime(value, Number(match[1]), Number(match[2]), new Date(), currentToday(today, new Date())));
          }}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  rows: { gap: t.space.md },
  field: { gap: t.space.xs },
}));
