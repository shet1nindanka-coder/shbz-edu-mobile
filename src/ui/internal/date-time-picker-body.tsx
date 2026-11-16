import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon } from '../icon';
import { Text } from '../text';
import {
  dateToParts,
  formatDateDisplay,
  formatDateTimeValue,
  formatTimeDisplay,
  parseDateTimeValue,
  partsToDate,
  todayDateTimeValue,
  withPickedDate,
  withPickedTime,
  type DateTimeLocale,
} from './date-time';
import { PressableScale } from './pressable-scale';

export type DateTimePickerBodyProps = {
  value: string;
  /** The caller's "today" (`YYYY-MM-DD`); see `DateTimeField`. */
  today?: string;
  onChange: (value: string) => void;
  locale: DateTimeLocale;
  dateLabel: string;
  timeLabel: string;
};

/**
 * Native picker body. iOS: the inline calendar + time wheel of the platform. Android: two rows that
 * open the system date and time dialogs. Both keep the site's rule "a day picked with no time → 23:59".
 */
export function DateTimePickerBody({ value, today, onChange, locale, dateLabel, timeLabel }: DateTimePickerBodyProps) {
  const theme = useTheme();
  const styles = useStyles();
  const parts = parseDateTimeValue(value);
  const shown = partsToDate(parts ?? parseDateTimeValue(todayDateTimeValue(new Date(), today)) ?? dateToParts(new Date()));

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        mode="datetime"
        display="inline"
        value={shown}
        locale={locale === 'ru' ? 'ru-RU' : 'en-GB'}
        themeVariant={theme.name}
        accentColor={theme.colors.accentSolid}
        onValueChange={(_event, date) => onChange(formatDateTimeValue(dateToParts(date)))}
      />
    );
  }

  const openDate = () =>
    DateTimePickerAndroid.open({
      mode: 'date',
      value: shown,
      firstDayOfWeek: 1,
      onValueChange: (_event, date) =>
        onChange(withPickedDate(value, date.getFullYear(), date.getMonth() + 1, date.getDate())),
    });
  const openTime = () =>
    DateTimePickerAndroid.open({
      mode: 'time',
      value: shown,
      is24Hour: true,
      onValueChange: (_event, date) => onChange(withPickedTime(value, date.getHours(), date.getMinutes(), new Date(), today)),
    });

  return (
    <View style={styles.rows}>
      <PressableScale accessibilityRole="button" accessibilityLabel={dateLabel} onPress={openDate} style={styles.row}>
        <Text variant="kickerSm" style={styles.rowLabel}>
          {dateLabel}
        </Text>
        <Text variant="smallMedium" color={parts ? 'textStrong' : 'placeholder'} tabular>
          {parts ? formatDateDisplay(parts, locale) : '—'}
        </Text>
        <Icon name="calendar" size={16} color="kicker" />
      </PressableScale>
      <PressableScale accessibilityRole="button" accessibilityLabel={timeLabel} onPress={openTime} style={styles.row}>
        <Text variant="kickerSm" style={styles.rowLabel}>
          {timeLabel}
        </Text>
        <Text variant="smallMedium" color={parts ? 'textStrong' : 'placeholder'} tabular>
          {parts ? formatTimeDisplay(parts) : '—'}
        </Text>
        <Icon name="clock" size={16} color="kicker" />
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  rows: { gap: t.space.md },
  row: {
    height: t.sizes.dateTrigger,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingHorizontal: 14,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
    borderColor: t.colors.inputBorder,
    backgroundColor: t.colors.inputBg,
  },
  rowLabel: { flex: 1 },
}));
