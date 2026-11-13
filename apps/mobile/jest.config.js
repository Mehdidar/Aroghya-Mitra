/** @type {import('jest').Config} */
module.exports = {
  // jest-expo (SDK 58) replaces P3's ts-jest setup: it transforms TS/TSX with babel-preset-expo and
  // mocks native modules, so the same runner covers P3's pure-logic tests and RNTL screen tests.
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Never put tests inside app/: Expo Router treats every file there as a route.
  testMatch: ['<rootDir>/{features,server,__tests__}/**/*.test.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/\\.expo/'],
  // Workspace packages (tsconfig paths are not visible to Jest).
  moduleNameMapper: {
    '^@am/shared$': '<rootDir>/../../packages/shared/index.ts',
    '^@am/patient-ai$': '<rootDir>/../../packages/patient-ai/index.ts',
    '^@am/records$': '<rootDir>/../../packages/records/index.ts',
    '^@am/(shared|patient-ai|records)/(.*)$': '<rootDir>/../../packages/$1/$2',
  },
};
