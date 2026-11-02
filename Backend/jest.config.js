module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // Force exit after tests complete (handles open handles from pg pool)
  forceExit: true,
  detectOpenHandles: true,
  // Coverage settings
  collectCoverageFrom: [
    'models/**/*.js',
    'controllers/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage'
};
