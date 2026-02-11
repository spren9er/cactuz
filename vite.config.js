import { defineConfig } from 'vitest/config';
import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { webdriverio } from '@vitest/browser-webdriverio';

export default defineConfig({
  plugins: [sveltekit(), devtoolsJson()],
  test: {
    browser: {
      enabled: true,
      instances: [{ browser: 'chrome' }],
      provider: webdriverio({}),
      headless: true,
      isolate: true,
      fileParallelism: true,
    },
    include: ['tests/**/*.test.js'],
  },
});
