import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, expect: { timeout: 12000 },
  fullyParallel: false, workers: 1, reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:3000', channel: process.env.PLAYWRIGHT_CHANNEL, headless: true, viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
