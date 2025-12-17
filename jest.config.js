module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src/api/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          noImplicitAny: false,
          noUnusedLocals: false,
          noUnusedParameters: false,
          skipLibCheck: true,
          isolatedModules: true,
        },
        isolatedModules: true,
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/api/tests/setup.ts'],
  testTimeout: 30000,
  forceExit: false,
};
