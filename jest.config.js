const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  displayName: 'Unit Tests',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{js,jsx,ts,tsx}',
    '<rootDir>/__tests__/**/*.{js,jsx,ts,tsx}'
  ],
  testPathIgnorePatterns: [
    '<rootDir>/__tests__/integration/',
    '<rootDir>/__tests__/e2e/',
  '<rootDir>/node_modules/',
  '<rootDir>/__tests__/setup/',
  '<rootDir>/__tests__/mocks/'
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**/*',
    '!src/pages/**/*', // Exclude Next.js pages from coverage
    '!src/app/**/page.tsx', // Exclude Next.js app router pages
    '!src/app/**/layout.tsx', // Exclude Next.js layouts
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  '^@supabase/supabase-js$': '<rootDir>/__tests__/mocks/supabaseClientMock.cjs'
  },
  // transformIgnorePatterns: By default node_modules are ignored. Some dependencies (like isows)
  // ship ESM sources and must be transformed. Whitelist them here so Jest transforms them.
  transformIgnorePatterns: [
    'node_modules/(?!isows|@supabase/realtime-js|@supabase/supabase-js)'
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)