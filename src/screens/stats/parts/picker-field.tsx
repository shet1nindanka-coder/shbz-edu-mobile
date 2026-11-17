import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, EmptyState, Icon, PressableScale, Select, Text, TextField } from '@/ui';

import { PICKER_SEARCH_FROM, filterPickerOptions } from '../logic';

const ROW_GAP = 2;

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
 * a search field, so the wanted row is two taps and a few letters away. That list has no upper bound (for
 * a developer it is the whole platform), so it is virtualised; the sheet gives it a bounded height.
 */

/** Share of the window the option list may take; the title and the search field need the rest. */
const LIST_MAX_SHARE = 0.5;
export function PickerField({ label, options, value, onChange, disabled = false, testID }: PickerFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  const window = useWindowDimensions();
  const { dict, m } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Measured height of all rows (labels may wrap); until the first layout a one-line estimate is used.
  const [contentHeight, setContentHeight] = useState<number | null>(null);

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
  // A short result is as tall as its rows; a long one scrolls inside the cap.
  const rowStride = theme.sizes.minTouch + ROW_GAP;
  const listHeight = Math.min(contentHeight ?? filtered.length * rowStride, Math.round(window.height * LIST_MAX_SHARE));

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
        onClosed={() => {
          setQuery('');
          setContentHeight(null);
        }}
        closeLabel={m.common.actions.close}
        title={label}
        // The option list scrolls by itself (FlashList), not the sheet.
        scroll={false}
        // Without a ScrollView the body must shrink itself in a short window, or the list overflows the sheet.
        contentStyle={styles.shrink}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        <View style={styles.sheet}>
          <TextField
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              // Another result set: back to the estimate until its rows are measured.
              setContentHeight(null);
            }}
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
            <View
              accessibilityRole="menu"
              // The height is only preferred: in a short window the list gives way (down to one row) to the search.
              style={[styles.shrink, { height: listHeight, minHeight: Math.min(listHeight, rowStride) }]}
            >
              <FlashList
                data={filtered}
                keyExtractor={(option) => option.value}
                renderItem={({ item: option }) => {
                  const active = option.value === value;
                  return (
                    <View style={styles.item}>
                      <PressableScale
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
                    </View>
                  );
                }}
                // The tick lives outside the rows.
                extraData={value}
                onContentSizeChange={(_width, height) => setContentHeight(height)}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                testID={testID ? `${testID}-options` : undefined}
              />
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
  sheet: { flexShrink: 1, minHeight: 0, gap: t.space.sm, paddingTop: t.space.xs },
  shrink: { flexShrink: 1, minHeight: 0 },
  // The gap between rows lives inside the cells: FlashList measures each one.
  item: { paddingBottom: ROW_GAP },
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
