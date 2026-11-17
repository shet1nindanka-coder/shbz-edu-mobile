// Native render tests: screens are rendered with React Native's own (non-web) module resolution for iOS and
// Android, so native-only branches and files run. Separate from `npm run test` (pure logic, tsx --test).
/** @type {import('jest').Config} */
const shared = {
  testMatch: ['<rootDir>/native-tests/**/*.test.ts?(x)'],
  moduleNameMapper: { '^@/assets/(.*)$': '<rootDir>/assets/$1', '^@/(.*)$': '<rootDir>/src/$1' },
  setupFilesAfterEnv: ['<rootDir>/native-tests/setup.ts'],
};

module.exports = {
  projects: [
    { ...shared, preset: 'jest-expo/ios', displayName: 'ios' },
    { ...shared, preset: 'jest-expo/android', displayName: 'android' },
  ],
};
