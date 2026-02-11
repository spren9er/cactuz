import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit(), devtoolsJson()],
  test: {
    environment: 'jsdom',
    alias: {
      $lib: new URL('./src/lib', import.meta.url).pathname,
    },
  },
});
