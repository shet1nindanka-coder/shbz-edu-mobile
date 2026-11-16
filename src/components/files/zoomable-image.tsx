// A fitted image with pinch-zoom, pan and double-tap (docs/spec/09-data-i18n-math.md §5.2: "full-screen
// modal with pinch-zoom / pan"). Gestures run on the UI thread (gesture-handler + reanimated); the parent
// pager is told when the picture is zoomed so it can stop paging.
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { makeStyles } from '@/theme';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/** How far a pinch may overshoot the limits before it springs back. */
const RUBBER = 0.75;
const SETTLE_MS = 180;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/** Largest pan offset at `scale` that still keeps the picture covering the viewport along one axis. */
function maxOffset(scale: number, size: number): number {
  'worklet';
  return Math.max(0, (size * (scale - 1)) / 2);
}

export type ZoomableImageProps = {
  source: { uri: string; headers?: Record<string, string> };
  accessibilityLabel: string;
  /** False for a page that is not on screen: its zoom resets, so it is fitted again when swiped back. */
  active?: boolean;
  /** Fired when the picture enters or leaves the zoomed state. */
  onZoomChange?: (zoomed: boolean) => void;
  onLoad?: () => void;
  onError?: () => void;
};

export function ZoomableImage({
  source,
  accessibilityLabel,
  active = true,
  onZoomChange,
  onLoad,
  onError,
}: ZoomableImageProps) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? 0 : SETTLE_MS;

  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Values at the start of the running gesture.
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // Pinch focal point relative to the centre of the viewport.
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const zoomed = useSharedValue(false);

  const reportZoom = (value: boolean) => onZoomChange?.(value);

  useEffect(() => {
    if (active) return;
    scale.set(1);
    translateX.set(0);
    translateY.set(0);
    zoomed.set(false);
  }, [active, scale, translateX, translateY, zoomed]);

  const pinch = usePinchGesture({
    onActivate: (event) => {
      startScale.set(scale.get());
      startX.set(translateX.get());
      startY.set(translateY.get());
      focalX.set(event.focalX - width.get() / 2);
      focalY.set(event.focalY - height.get() / 2);
    },
    onUpdate: (event) => {
      const next = clamp(startScale.get() * event.scale, RUBBER, MAX_SCALE / RUBBER);
      const ratio = next / startScale.get();
      scale.set(next);
      // Keep the point under the fingers where it is: t = o − ratio · (o − t₀).
      translateX.set(focalX.get() - ratio * (focalX.get() - startX.get()));
      translateY.set(focalY.get() - ratio * (focalY.get() - startY.get()));
    },
    onDeactivate: () => {
      const target = clamp(scale.get(), 1, MAX_SCALE);
      const isZoomed = target > 1.01;
      scale.set(withTiming(target, { duration }));
      translateX.set(
        withTiming(clamp(translateX.get(), -maxOffset(target, width.get()), maxOffset(target, width.get())), { duration }),
      );
      translateY.set(
        withTiming(clamp(translateY.get(), -maxOffset(target, height.get()), maxOffset(target, height.get())), {
          duration,
        }),
      );
      if (zoomed.get() !== isZoomed) {
        zoomed.set(isZoomed);
        scheduleOnRN(reportZoom, isZoomed);
      }
    },
  });

  // One-finger pan belongs to the pager while the picture is fitted, and to the picture once zoomed.
  const pan = usePanGesture({
    enabled: zoomed,
    maxPointers: 2,
    onActivate: () => {
      startX.set(translateX.get());
      startY.set(translateY.get());
    },
    onUpdate: (event) => {
      const limitX = maxOffset(scale.get(), width.get());
      const limitY = maxOffset(scale.get(), height.get());
      translateX.set(clamp(startX.get() + event.translationX, -limitX, limitX));
      translateY.set(clamp(startY.get() + event.translationY, -limitY, limitY));
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (event) => {
      if (scale.get() > 1.01) {
        scale.set(withTiming(1, { duration }));
        translateX.set(withTiming(0, { duration }));
        translateY.set(withTiming(0, { duration }));
        zoomed.set(false);
        scheduleOnRN(reportZoom, false);
        return;
      }
      // Zoom towards the tapped point.
      const offsetX = event.x - width.get() / 2;
      const offsetY = event.y - height.get() / 2;
      const limitX = maxOffset(DOUBLE_TAP_SCALE, width.get());
      const limitY = maxOffset(DOUBLE_TAP_SCALE, height.get());
      scale.set(withTiming(DOUBLE_TAP_SCALE, { duration }));
      translateX.set(withTiming(clamp(-offsetX * (DOUBLE_TAP_SCALE - 1), -limitX, limitX), { duration }));
      translateY.set(withTiming(clamp(-offsetY * (DOUBLE_TAP_SCALE - 1), -limitY, limitY), { duration }));
      zoomed.set(true);
      scheduleOnRN(reportZoom, true);
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }, { translateY: translateY.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.viewport}
        onLayout={(event) => {
          width.set(event.nativeEvent.layout.width);
          height.set(event.nativeEvent.layout.height);
        }}
      >
        <Animated.View style={[styles.content, animatedStyle]}>
          <Image
            source={source}
            contentFit="contain"
            transition={150}
            accessibilityRole="image"
            accessibilityLabel={accessibilityLabel}
            onLoad={onLoad}
            onError={onError}
            style={styles.image}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const useStyles = makeStyles(() => ({
  viewport: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
  image: { flex: 1 },
}));
