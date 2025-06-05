module.exports = {
    testEnvironment: 'jest-environment-jsdom',
    setupFilesAfterEnv: [],
    moduleFileExtensions: ['ts', 'js'],
    transform: {
      '^.+\\.ts$': 'ts-jest'
    },
    testMatch: ['<rootDir>/tests/**/*.test.ts'],
    testPathIgnorePatterns: ['<rootDir>/dist/']
  };