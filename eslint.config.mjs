// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    'vue/no-multiple-template-root': 'off',
    'vue/max-attributes-per-line': ['error', { singleline: 3 }],
    // TEMPORARY: the legacy server code is untyped and gets rewritten with real types in
    // refactor phases 1-3. Phase 3's Definition of Done restores this to 'error' for server/**.
    '@typescript-eslint/no-explicit-any': 'warn'
  }
}, {
  // Tests assert on untyped JSON responses and raw rows; `any` is the honest type there.
  files: ['test/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off'
  }
})
