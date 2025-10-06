const { pathsToModuleNameMapper } = require('ts-jest')
const { compilerOptions } = require('./tsconfig')

module.exports = {
  displayName: 'Integration Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.integration.setup.js'],
  testMatch: [
    '<rootDir>/__tests__/integration/**/*.{js,jsx,ts,tsx}',
  ],
  collectCoverageFrom: [
    'src/lib/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**/*',
  ],
  moduleNameMapping: pathsToModuleNameMapper(compilerOptions.paths || {}, {
    prefix: '<rootDir>/',
  }),
  globalSetup: '<rootDir>/__tests__/setup/globalSetup.js',
  globalTeardown: '<rootDir>/__tests__/setup/globalTeardown.js',
  testTimeout: 30000, // 30 seconds for integration tests
}