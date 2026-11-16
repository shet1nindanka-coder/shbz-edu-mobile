import { useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  type GestureResponderEvent,
  type Insets,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { easing } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableState = { pressed: boolean; focused: boolean };

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** Extra style while the finger is down (the web `:active` state). */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Target scale while pressed. Default 0.97 (spec §6.3); pass 1 to keep the element still. */
  scaleTo?: number;
  children?: ReactNode | ((state: PressableState) => ReactNode);
};

/** Insets that grow a `width × height` visual to the 44pt minimum touch target. */
export function hitSlopFor(width: number, height: number, min = 44): Insets | undefined {
  const horizontal = Math.max(0, Math.ceil((min - width) / 2));
  const vertical = Math.max(0, Math.ceil((min - height) / 2));
  if (horizontal === 0 && vertical === 0) return undefined;
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}

type FocusTarget = { matches?: (selector: string) => boolean };

/** True when the focus came from the keyboard (web); pointer focus must not draw the outline. */
function isKeyboardFocus(target: unknown): boolean {
  if (Platform.OS !== 'web') return false;
  const element = target as FocusTarget | null;
  try {
    return element?.matches?.(':focus-visible') ?? true;
  } catch {
    return true;
  }
}

/**
 * The system's press feedback: scale to 0.97 in 60 ms, release over 180 ms ease-out. Disabled elements
 * never transform; under reduced motion nothing moves. On web a keyboard focus draws the 2px accent
 * outline. Internal building block of every interactive primitive.
 */
export function PressableScale({
  style,
  pressedStyle,
  scaleTo,
  children,
  disabled,
  onPressIn,
  onPressOut,
  onFocus,
  onBlur,
  ...rest
}: PressableScaleProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const target = scaleTo ?? theme.motion.pressScale;

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const handlePressIn = (event: GestureResponderEvent) => {
    setPressed(true);
    if (!reducedMotion && target !== 1) {
      scale.set(withTiming(target, { duration: theme.motion.duration.press }));
    }
    onPressIn?.(event);
  };
  const handlePressOut = (event: GestureResponderEvent) => {
    setPressed(false);
    scale.set(withTiming(1, { duration: theme.motion.duration.pressRelease, easing: easing('out') }));
    onPressOut?.(event);
  };

  const focusRing: ViewStyle | null =
    focused && !disabled
      ? { outlineWidth: 2, outlineStyle: 'solid', outlineColor: theme.colors.accentSolid, outlineOffset: 2 }
      : null;

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onFocus={(event) => {
        setFocused(isKeyboardFocus(event.target));
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[style, pressed && !disabled ? pressedStyle : null, focusRing, animatedStyle]}
    >
      {typeof children === 'function' ? children({ pressed: pressed && !disabled, focused }) : children}
    </AnimatedPressable>
  );
}
