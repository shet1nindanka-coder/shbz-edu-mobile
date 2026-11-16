import { useState } from 'react';
import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, EmptyState, Icon, PressableScale, Select, Text, TextField } from '@/ui';

import { PICKER_SEARCH_FROM, filterPickerOptions } from '../logic';

export type PickerOption = { value: string; label: string };

export type PickerFieldProps = {
  label: string;
  options: readonly PickerOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testID?: string;
};

/**
 * A select whose menu is a bottom sheet (06 §1.6 "Mobile translation"). Short lists use the kit's
 * `Select`; a long one (every student of the school, every topic) gets the same trigger and a sheet with
 * a search field, so the wanted row is two taps and a few letters away.
 */
export function PickerField({ label, options, value, onChange, disabled = false, testID }: PickerFieldProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  if (options.length < PICKER_SEARCH_FROM) {
    return (
      <Select
        label={label}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={dict.topics.widgets.selectPlaceholder}
        closeLabel={m.common.actions.close}
        size="sm"
        disabled={disabled}
        testID={testID}
      />
    );
  }

  const selected = options.find((option) => option.value === value) ?? null;
  const filtered = filterPickerOptions(options, query);

  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      <PressableScale
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? dict.topics.widgets.selectPlaceholder }}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.trigger, open ? styles.triggerOpen : null, disabled ? styles.disabled : null]}
        testID={testID}
      >
        <Text variant="smallStrong" numberOfLines={1} color={selected ? 'textStrong' : 'placeholder'} style={styles.value}>
          {selected?.label ?? dict.topics.widgets.selectPlaceholder}
        </Text>
        <Icon name="chevronDown" size={16} color="kicker" />
      </PressableScale>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        onClosed={() => setQuery('')}
        closeLabel={m.common.actions.close}
        title={label}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        <View style={styles.sheet}>
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder={m.stats.picker.searchPlaceholder}
            accessibilityLabel={m.stats.picker.searchPlaceholder}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            left={<Icon name="search" size={16} color="kicker" />}
            testID={testID ? `${testID}-search` : undefined}
          />
          {filtered.length === 0 ? (
            <EmptyState variant="plain" title={dict.planner.common.nothingFound} />
          ) : (
            <View accessibilityRole="menu" style={styles.menu}>
              {filtered.map((option) => {
                const active = option.value === value;
                return (
                  <PressableScale
                    key={option.value}
                    accessibilityRole="menuitem"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      setOpen(false);
                      if (!active) onChange(option.value);
                    }}
                    scaleTo={1}
                    style={[styles.option, active ? styles.optionActive : null]}
                    pressedStyle={active ? null : styles.optionPressed}
                    testID={testID ? `${testID}-option-${option.value}` : undefined}
                  >
                    <Text variant="bodyStrong" color={active ? 'greenText' : 'textStrong'} style={styles.value}>
                      {option.label}
                    </Text>
                    {active ? <Icon name="check" size={16} color="greenText" /> : null}
                  </PressableScale>
                );
              })}
            </View>
          )}
        </View>
      </BottomSheet>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  field: { gap: t.space.sm },
  // The kit's `Select` trigger, size `sm`.
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    alignSelf: 'stretch',
    height: t.sizes.select.sm,
    paddingHorizontal: 14,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
    borderColor: t.colors.inputBorder,
    backgroundColor: t.colors.inputBg,
  },
  triggerOpen: { borderColor: t.colors.inputBorderFocus },
  value: { flex: 1, minWidth: 0 },
  sheet: { gap: t.space.sm, paddingTop: t.space.xs },
  menu: { gap: 2 },
  option: {
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: t.radii.md,
  },
  optionActive: { backgroundColor: t.colors.accentSoft },
  optionPressed: { backgroundColor: t.colors.tabHover },
  disabled: { opacity: 0.55 },
}));
