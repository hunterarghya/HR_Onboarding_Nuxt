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
          include: ['test/unit/**/*.test.ts']
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
