import { useState } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { BottomSheet } from './bottom-sheet';
import { Button } from './button';
import { Icon } from './icon';
import { formatDateTimeDisplay, todayDateTimeValue, type DateTimeLocale } from './internal/date-time';
import { DateTimePickerBody } from './internal/date-time-picker-body';
import { FieldShell } from './internal/field-shell';
import { PressableScale } from './internal/pressable-scale';
import { Text } from './text';
import { TextButton } from './text-button';

export type DateTimeFieldLabels = {
  /** `dict.topics.widgets.datetime.clear` — «Очистить». */
  clear: string;
  /** `…datetime.today` — «Сегодня». */
  today: string;
  /** `…datetime.done` — «Готово». */
  done: string;
  /** Accessible name of the sheet backdrop / close button. */
  close: string;
  /** Caption of the date control (Android, web). */
  date: string;
  /** `…datetime.time` — «Время». */
  time: string;
};

export type DateTimeFieldProps = {
  /** Wall-clock `YYYY-MM-DDTHH:mm`; empty string = no value. */
  value: string;
  /**
   * The calendar day (`YYYY-MM-DD`) that is "today" in the zone the value is read in. Screens pass the
   * Moscow day (`mskToday()`): deadlines and lesson starts are Moscow wall clock on every device.
   * Default: the device's own day.
   */
  today?: string;
  onChange: (value: string) => void;
  /** Fires once when the sheet closes, with the final value. */
  onCommit?: (value: string) => void;
  /** `dict.topics.widgets.datetime.placeholder` — «Выбрать дату и время». */
  placeholder: string;
  labels: DateTimeFieldLabels;
  /** Display format: `ru` → dd.MM.yyyy, HH:mm · `en` → dd/MM/yyyy, HH:mm. */
  locale?: DateTimeLocale;
  /** Label above the trigger; also the sheet title. */
  label?: string;
  error?: string | null;
  helper?: string;
  /** `field` — 46 high form control (default); `compact` — inline chip-sized trigger. */
  variant?: 'field' | 'compact';
  disabled?: boolean;
  /** Required when there is no `label`. */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Date-time field (`ShbzDateTimePicker`). The trigger is the site's; the picker is a bottom sheet with
 * the platform's date/time controls and the site's footer: Clear · Today · Done. Rules kept from the
 * site: a day picked with no time gets 23:59, "Today" = today 23:59, "Clear" empties and closes.
 */
export function DateTimeField({
  value,
  today,
  onChange,
  onCommit,
  placeholder,
  labels,
  locale = 'ru',
  label,
  error,
  helper,
  variant = 'field',
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: DateTimeFieldProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const display = formatDateTimeDisplay(value, locale);
  const compact = variant === 'compact';

  const close = (finalValue: string) => {
    setOpen(false);
    onCommit?.(finalValue);
  };
  const done = () => {
    // The iOS inline picker always shows a selection; "Done" on an untouched picker takes what it shows.
    if (!value && Platform.OS === 'ios') {
      const shown = todayDateTimeValue(new Date(), today);
      onChange(shown);
      close(shown);
      return;
    }
    close(value);
  };

  const trigger = (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
      accessibilityValue={{ text: display || placeholder }}
      accessibilityState={{ disabled, expanded: open }}
      disabled={disabled}
      onPress={() => setOpen(true)}
      hitSlop={compact ? { top: 8, bottom: 8 } : undefined}
      testID={testID}
      style={[
        compact ? styles.compact : styles.field,
        open ? (compact ? styles.compactOpen : styles.fieldOpen) : null,
        disabled ? styles.disabled : null,
        compact ? style : null,
      ]}
    >
      {compact ? <Icon name="calendar" size={12} color="kicker" /> : null}
      <Text
        variant={compact ? 'badgeMuted' : 'smallMedium'}
        color={display ? 'textStrong' : 'placeholder'}
        numberOfLines={1}
        tabular
        style={compact ? null : styles.value}
      >
        {display || placeholder}
      </Text>
      {compact ? null : <Icon name="calendar" size={16} color="kicker" />}
    </PressableScale>
  );

  const sheet = (
    <BottomSheet
      visible={open}
      onClose={() => close(value)}
      closeLabel={labels.close}
      title={label ?? placeholder}
      footer={
        <View style={styles.footer}>
          <TextButton
            label={labels.clear}
            tone="danger"
            onPress={() => {
              onChange('');
              close('');
            }}
          />
          <View style={styles.footerRight}>
            <TextButton label={labels.today} onPress={() => onChange(todayDateTimeValue(new Date(), today))} />
            <Button label={labels.done} variant="dark" onPress={done} />
          </View>
        </View>
      }
    >
      <View style={styles.body}>
        <DateTimePickerBody
          value={value}
          today={today}
          onChange={onChange}
          locale={locale}
          dateLabel={labels.date}
          timeLabel={labels.time}
        />
      </View>
    </BottomSheet>
  );

  if (compact) {
    return (
      <>
        {trigger}
        {sheet}
      </>
    );
  }
  return (
    <FieldShell label={label} error={error} helper={helper} style={style}>
      {trigger}
      {sheet}
    </FieldShell>
  );
}

const useStyles = makeStyles((t) => ({
  field: {
    height: t.sizes.dateTrigger,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    alignSelf: 'stretch',
    paddingHorizontal: 14,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
    borderColor: t.colors.inputBorder,
    backgroundColor: t.colors.inputBg,
  },
  fieldOpen: { borderColor: t.colors.inputBorderFocus, boxShadow: `0 0 0 4px ${t.colors.inputRing}` },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: t.radii.sm,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.inputBorder,
    backgroundColor: t.colors.inputBg,
  },
  compactOpen: { borderColor: t.colors.inputBorderFocus, boxShadow: `0 0 0 3px ${t.colors.inputRing}` },
  value: { flex: 1, minWidth: 0 },
  body: { paddingBottom: t.space.md },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: t.space.lg },
  disabled: { opacity: 0.55 },
}));
