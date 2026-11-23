import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { makeStyles, useTheme, type TextVariant } from '@/theme';

import { withErrorHint } from './a11y';
import { BottomSheet } from './bottom-sheet';
import { Icon } from './icon';
import { FieldShell } from './internal/field-shell';
import { easing } from './internal/motion';
import { PressableScale } from './internal/pressable-scale';
import { Text } from './text';

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export type SelectProps<T extends string | number> = {
  options: readonly SelectOption<T>[];
  /** Selected value; `null` shows the placeholder. */
  value: T | null;
  onChange: (value: T) => void;
  /** Shown when nothing is selected, e.g. `dict.topics.widgets.selectPlaceholder` («Выбрать»). */
  placeholder: string;
  /** Accessible name of the sheet's backdrop and close button, e.g. "Закрыть". */
  closeLabel: string;
  /** Label above the trigger; also the sheet title unless `sheetTitle` is given. */
  label?: string;
  sheetTitle?: string;
  error?: string | null;
  helper?: string;
  /** Trigger size: `md` 50 (default) · `sm` 46 · `xs` 38. */
  size?: 'md' | 'sm' | 'xs';
  disabled?: boolean;
  /** Required when there is no `label`. */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const SIZE = {
  md: { radius: 'md', text: 'bodyMedium', paddingX: 12 },
  sm: { radius: 'md', text: 'bodyMedium', paddingX: 12 },
  xs: { radius: 'md', text: 'label', paddingX: 12 },
} as const satisfies Record<string, { radius: 'select' | 'md' | 'selectXs'; text: TextVariant; paddingX: number }>;

/**
 * Select (`ShbzSelect`): the site's trigger; the menu is a bottom sheet with 44pt option rows. The
 * selected option is tinted and ticked.
 */
export function Select<T extends string | number>({
  options,
  value,
  onChange,
  placeholder,
  closeLabel,
  label,
  sheetTitle,
  error,
  helper,
  size = 'md',
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: SelectProps<T>) {
  const theme = useTheme();
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const chevron = useSharedValue(0);
  const selected = options.find((option) => option.value === value) ?? null;
  const spec = SIZE[size];

  useEffect(() => {
    chevron.set(withTiming(open ? 1 : 0, { duration: reducedMotion ? 0 : theme.motion.duration.base, easing: easing('inOut') }));
  }, [open, chevron, reducedMotion, theme]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chevron.get() * 180}deg` }] }));

  return (
    <FieldShell label={label} error={error} helper={helper} style={style}>
      <PressableScale
        accessibilityRole="combobox"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityHint={withErrorHint(error, undefined)}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        hitSlop={size === 'xs' ? { top: 4, bottom: 4 } : undefined}
        testID={testID}
        style={[
          styles.trigger,
          {
            height: theme.sizes.select[size],
            borderRadius: theme.radii[spec.radius],
            paddingHorizontal: spec.paddingX,
          },
          open ? styles.triggerOpen : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Text variant={spec.text} numberOfLines={1} color={selected ? 'textStrong' : 'placeholder'} style={styles.value}>
          {selected?.label ?? placeholder}
        </Text>
        <Animated.View style={chevronStyle}>
          <Icon name="chevronDown" size={16} color="textMuted" />
        </Animated.View>
      </PressableScale>
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        closeLabel={closeLabel}
        title={sheetTitle ?? label}
        padded={false}
      >
        <View accessibilityRole="menu" style={styles.menu}>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <PressableScale
                key={String(option.value)}
                accessibilityRole="menuitem"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active, disabled: Boolean(option.disabled) }}
                disabled={option.disabled}
                onPress={() => {
                  setOpen(false);
                  if (!active) onChange(option.value);
                }}
                scaleTo={1}
                style={[styles.option, active ? styles.optionActive : null, option.disabled ? styles.disabled : null]}
                pressedStyle={active ? null : styles.optionPressed}
              >
                <Text variant={active ? 'bodyBold' : 'bodyStrong'} style={styles.value}>
                  {option.label}
                </Text>
                {active ? <Icon name="check" size={20} color="textStrong" /> : null}
              </PressableScale>
            );
          })}
        </View>
      </BottomSheet>
    </FieldShell>
  );
}

const useStyles = makeStyles((t) => ({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    alignSelf: 'stretch',
    borderWidth: t.borders.interactive,
    borderColor: t.colors.inputBorder,
    backgroundColor: t.colors.inputBg,
  },
  triggerOpen: { borderColor: t.colors.inputBorderFocus, boxShadow: `0 0 0 4px ${t.colors.inputRing}` },
  value: { flex: 1, minWidth: 0 },
  // 8 + the option's own 12 lines the labels up with the sheet title (20).
  menu: { paddingHorizontal: 8, paddingTop: 4, paddingBottom: t.space.gutter, gap: 2 },
  option: {
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: t.radii.md,
  },
  optionActive: { backgroundColor: t.colors.softBg },
  optionPressed: { backgroundColor: t.colors.tabHover },
  disabled: { opacity: 0.55 },
}));
