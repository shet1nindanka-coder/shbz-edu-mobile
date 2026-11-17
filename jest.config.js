// Native render tests: screens are rendered with React Native's own (non-web) module resolution for iOS and
// Android, so native-only branches and files run. Separate from `npm run test` (pure logic, tsx --test).
/** @type {import('jest').Config} */
const shared = {
  testMatch: ['<rootDir>/native-tests/**/*.test.ts?(x)'],
  // explore.test.tsx is a developer tool (prints the controls of a screen); it runs only when asked to.
  testPathIgnorePatterns: ['/node_modules/', ...(process.env.EXPLORE_URL ? [] : ['/native-tests/explore\\.test\\.tsx$'])],
  moduleNameMapper: { '^@/assets/(.*)$': '<rootDir>/assets/$1', '^@/(.*)$': '<rootDir>/src/$1' },
  // Reanimated's own jest resolver: under jest its JS implementation is loaded instead of the native one.
  resolver: 'react-native-reanimated/jest/resolver',
  // jest-expo's list plus the packages of this app that ship untranspiled ES modules.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@shopify/flash-list))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  setupFiles: ['<rootDir>/native-tests/support/setup-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/native-tests/setup.ts'],
};

module.exports = {
  // A test launches the whole app, often several times.
  testTimeout: 300000,
  // Every cold start loads a new module registry; a worker is recycled between files once it has grown.
  workerIdleMemoryLimit: '1200MB',
  projects: [
    { ...shared, preset: 'jest-expo/ios', displayName: 'ios' },
    { ...shared, preset: 'jest-expo/android', displayName: 'android' },
  ],
};
