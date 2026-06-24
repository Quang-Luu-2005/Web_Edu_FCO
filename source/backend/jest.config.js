module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
  collectCoverageFrom: [
    'config/**/*.js',
    'middlewares/**/*.js',
    'routers/**/*.js',
    'services/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**'
  ],
  clearMocks: true,
  restoreMocks: true,
  verbose: false,
};