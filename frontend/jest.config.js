module.exports = {
  preset: 'jest-expo',
  // The first render of each file transforms React Native 0.88 from a cold cache (always the case in CI).
  testTimeout: 30000,
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/index.ts'],
  coverageReporters: ['lcov', 'text'],
};
