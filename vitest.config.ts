import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Load .env (real S3 credentials + endpoint) so the suite runs against bucket.ru.
// process.loadEnvFile is built into Node 20.6+; ignore if .env is absent (e.g. CI).
try {
  process.loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
} catch {
  // no .env present — rely on the ambient environment
}

export default defineConfig({
  // Default: hermetic in-memory S3 (see vitest.setup.ts). With
  // PROMO_TEST_LIVE_S3=true the suite hits the real bucket.ru endpoint,
  // so keep the generous network timeouts.
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
