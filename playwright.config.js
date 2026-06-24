const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/extension-e2e.spec.js',
  timeout: 60000,
  retries: 0,
  workers: 1, // Serial — each suite spawns its own browser
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    headless: false,
    actionTimeout: 15000,
  },
  outputDir: 'test-results/',
});
