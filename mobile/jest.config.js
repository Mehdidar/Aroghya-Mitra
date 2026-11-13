/** Jest runs only the pure-TypeScript logic (no React Native imports). */
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }] },
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
};
