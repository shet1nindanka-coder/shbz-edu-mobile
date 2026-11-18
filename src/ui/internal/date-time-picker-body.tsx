import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon } from '../icon';
import { useOverlayCovered } from '../overlay-cover';
import { Text } from '../text';
import {
  currentToday,
  formatDateDisplay,
  formatDateTimeValue,
  formatTimeDisplay,
  parseDateTimeValue,
  partsToPickerDate,
  pickerDateToParts,
  PICKER_TIME_ZONE,
  todayDateTimeValue,
  withPickedDate,
  withPickedTime,
  type DateTimeLocale,
  type TodayInput,
} from './date-time';
import { PressableScale } from './pressable-scale';

export type DateTimePickerBodyProps = {
  value: string;
  /** The caller's "today" (`YYYY-MM-DD`), a function read at use time; see `DateTimeField`. */
  today?: TodayInput;
  onChange: (value: string) => void;
  locale: DateTimeLocale;
  dateLabel: string;
  timeLabel: string;
  /**
   * Buttons of the Android system dialogs, in the app's language (the system's own «ОК / ОТМЕНА» follow the
   * device language). Month and weekday names inside the dialogs cannot be set from JS: they stay in the
   * device language.
   */
  okLabel?: string;
  cancelLabel?: string;
};

/**
 * Native picker body. iOS: the inline calendar + time wheel of the platform. Android: two rows that
 * open the system date and time dialogs. Both keep the site's rule "a day picked with no time → 23:59".
 */
export function DateTimePickerBody({ value, today, onChange, locale, dateLabel, timeLabel, okLabel, cancelLabel }: DateTimePickerBodyProps) {
  const theme = useTheme();
  const styles = useStyles();
  const parts = parseDateTimeValue(value);
  // The pickers show `PICKER_TIME_ZONE` (Moscow) and get the real instant of the Moscow wall clock; every
  // result is read back in Moscow time. Nothing goes through the device zone, whose DST gap would move
  // a Moscow 02:30 to 03:30 (or a date by a day far from UTC+3).
  const shown = partsToPickerDate(
    parts ?? parseDateTimeValue(todayDateTimeValue(new Date(), currentToday(today, new Date()))) ?? pickerDateToParts(new Date()),
  );
  const covered = useOverlayCovered();

  // Android: the system date / time dialog is a window above every window of the app, so the lock cover
  // cannot be drawn over it — it is closed instead (the pick in progress is dropped, the value stays).
  useEffect(() => {
    if (!covered || Platform.OS !== 'android') return;
    void DateTimePickerAndroid.dismiss('date').catch(() => undefined);
    void DateTimePickerAndroid.dismiss('time').catch(() => undefined);
  }, [covered]);

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        mode="datetime"
        display="inline"
        value={shown}
        timeZoneName={PICKER_TIME_ZONE}
        locale={locale === 'ru' ? 'ru-RU' : 'en-GB'}
        themeVariant={theme.name}
        accentColor={theme.colors.accentSolid}
        onValueChange={(_event, date) => onChange(formatDateTimeValue(pickerDateToParts(date)))}
      />
    );
  }

  // Only labels that are given replace the system ones (the library keeps the system text otherwise).
  const buttons = {
    ...(okLabel ? { positiveButton: { label: okLabel } } : null),
    ...(cancelLabel ? { negativeButton: { label: cancelLabel } } : null),
  };
  const openDate = () =>
    DateTimePickerAndroid.open({
      mode: 'date',
      value: shown,
      timeZoneName: PICKER_TIME_ZONE,
      firstDayOfWeek: 1,
      ...buttons,
      onValueChange: (_event, date) => {
        const picked = pickerDateToParts(date);
        onChange(withPickedDate(value, picked.year, picked.month, picked.day));
      },
    });
  const openTime = () =>
    DateTimePickerAndroid.open({
      mode: 'time',
      value: shown,
      timeZoneName: PICKER_TIME_ZONE,
      is24Hour: true,
      ...buttons,
      onValueChange: (_event, date) => {
        const picked = pickerDateToParts(date);
        onChange(withPickedTime(value, picked.hour, picked.minute, new Date(), currentToday(today, new Date())));
      },
    });
  const dateText = parts ? formatDateDisplay(parts, locale) : '—';
  const timeText = parts ? formatTimeDisplay(parts) : '—';

  return (
    <View style={styles.rows}>
      {/* The label replaces the children for TalkBack: the chosen value is its `accessibilityValue`. */}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={dateLabel}
        accessibilityValue={{ text: dateText }}
        onPress={openDate}
        testID="date-time-date-row"
        style={styles.row}
      >
        <Text variant="kickerSm" style={styles.rowLabel}>
          {dateLabel}
        </Text>
        <Text variant="smallMedium" color={parts ? 'textStrong' : 'placeholder'} tabular>
          {dateText}
        </Text>
        <Icon name="calendar" size={16} color="kicker" />
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={timeLabel}
        accessibilityValue={{ text: timeText }}
        onPress={openTime}
        testID="date-time-time-row"
        style={styles.row}
      >
        <Text variant="kickerSm" style={styles.rowLabel}>
          {timeLabel}
        </Text>
        <Text variant="smallMedium" color={parts ? 'textStrong' : 'placeholder'} tabular>
          {timeText}
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
