// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    'vue/no-multiple-template-root': 'off',
    'vue/max-attributes-per-line': ['error', { singleline: 3 }],
    // The frontend pages still use `any` for API responses; they get typed when the app consumes
    // shared response types. Server code is fully typed (see the server override below).
    '@typescript-eslint/no-explicit-any': 'warn'
  }
}, {
  files: ['server/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error'
  }
}, {
  // Tests assert on untyped JSON responses and raw rows; `any` is the honest type there.
  files: ['test/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off'
  }
})
