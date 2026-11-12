import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // the root alias Nuxt gives server code, so unit tests can import server modules directly
    alias: { '~~': fileURLToPath(new URL('.', import.meta.url)) }
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          // Server modules that import config need a valid env; nothing here reaches these services.
          env: {
            DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:9/unit_test',
            JWT_SECRET: 'unit-test-secret-unit-test-secret-0123',
            TOKEN_ENCRYPTION_KEY: '1e'.repeat(32),
            GOOGLE_CLIENT_ID: 'unit-client-id',
            GOOGLE_CLIENT_SECRET: 'unit-client-secret',
            GOOGLE_REDIRECT_URI: 'http://127.0.0.1:9/auth/google/callback',
            IMAGEKIT_PUBLIC_KEY: 'unit-public',
            IMAGEKIT_PRIVATE_KEY: 'unit-private',
            IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/unit',
            OLLAMA_BASE_URL: 'http://127.0.0.1:9'
          }
        }
      },
      {
        extends: true,
        test: {
          name: 'api',
          include: ['test/api/**/*.test.ts'],
          globalSetup: ['test/api/setup/global-setup.ts'],
          // One server and one database: files run one at a time and each resets the tables it uses.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000
        }
      }
    ]
  }
})
