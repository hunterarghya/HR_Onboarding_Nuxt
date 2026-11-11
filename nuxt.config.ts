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

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  devServer: {
    port: 3001
  },

  compatibilityDate: '2024-07-11',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
