import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts']
        }
      },
      {
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
