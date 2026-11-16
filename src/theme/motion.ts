// Motion tokens (docs/spec/08-design-system.md §6). Motion is feedback, never decoration: animate only
// transform and opacity, exit faster than entry, and drop movement under reduced motion.

export type BezierPoints = readonly [number, number, number, number];

export const motion = {
  duration: {
    press: 60,
    pressRelease: 180,
    fast: 150,
    base: 180,
    slow: 200,
    enter: 240,
    enterStagger: 45,
    enterMaxIndex: 6,
    tabSlide: 260,
    sheetIn: 260,
    sheetOut: 160,
    dialogIn: 200,
    dialogOut: 120,
    backdropIn: 200,
    backdropOut: 120,
    dropdownIn: 200,
    progress: 420,
    countUp: 600,
    statusStamp: 220,
    checkPop: 220,
    copyFlash: 900,
    copyPillIn: 220,
    copyPillVisible: 1300,
    savedFlashVisible: 1600,
    freshMark: 1400,
    streak: 900,
    dropzoneSuccessHold: 900,
    shimmer: 1200,
    shimmerStagger: 150,
    skeletonFade: 160,
    spinner: 700,
  },
  /** cubic-bezier control points -> `Easing.bezier(...points)` (Reanimated). */
  easing: {
    spring: [0.22, 1, 0.36, 1],
    standard: [0.2, 0.8, 0.2, 1],
    out: [0.23, 1, 0.32, 1],
    inOut: [0.77, 0, 0.175, 1],
    drawer: [0.32, 0.72, 0, 1],
    overshoot: [0.34, 1.56, 0.64, 1],
    bounce: [0.22, 1.4, 0.36, 1],
  },
  pressScale: 0.97,
  checkboxPressScale: 0.92,
} as const satisfies {
  duration: Record<string, number>;
  easing: Record<string, BezierPoints>;
  pressScale: number;
  checkboxPressScale: number;
};

export type EasingToken = keyof typeof motion.easing;
