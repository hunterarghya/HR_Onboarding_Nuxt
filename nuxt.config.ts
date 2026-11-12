// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  // `pnpm test` boots its own dev server with --envName test; this keeps its generated files out
  // of the `.nuxt` that `pnpm dev` and `pnpm typecheck` use.
  $test: {
    buildDir: 'node_modules/.cache/nuxt-smoke'
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  devServer: {
    port: 3001
  },

  compatibilityDate: '2024-07-11',

  nitro: {
    // SQL migrations ship inside the server bundle (read by server/database/migration-files.ts)
    serverAssets: [{ baseName: 'migrations', dir: 'database/migrations' }]
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
