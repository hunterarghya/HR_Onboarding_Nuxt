// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

// Layer rules (refactor_docs/03 §2), enforced so they can't erode:
// features may use core, integrations and agents; nothing below features may import a feature.
const NO_FEATURE_IMPORTS = {
  group: ['~~/server/features/*', '**/features/*'],
  message: 'Lower layers (core, integrations, agents, database) must not import from server/features.'
}
const NO_H3 = {
  name: 'h3',
  message: 'Only controllers, middleware and server/core/{http,auth,errors} use h3; this code also runs in task workers.'
}

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
    '@typescript-eslint/no-explicit-any': 'error',
    // settings come from config/env.ts, which validates them at boot
    'no-restricted-properties': ['error', { object: 'process', property: 'env', message: 'Read settings from ~~/server/config/env (config), not process.env.' }]
  }
}, {
  files: ['server/config/env.ts'],
  rules: { 'no-restricted-properties': 'off' }
}, {
  files: ['server/core/**', 'server/integrations/**', 'server/agents/**', 'server/database/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [NO_FEATURE_IMPORTS] }] }
}, {
  files: ['server/integrations/**', 'server/agents/**', 'server/database/**', 'server/core/tasks/**', 'server/core/db/**'],
  rules: { 'no-restricted-imports': ['error', { paths: [NO_H3], patterns: [NO_FEATURE_IMPORTS] }] }
}, {
  files: ['server/features/**/*.service.ts', 'server/features/**/*.repository.ts', 'server/features/**/*.tasks.ts', 'server/features/**/*.dto.ts'],
  rules: { 'no-restricted-imports': ['error', { paths: [NO_H3] }] }
}, {
  // Tests assert on untyped JSON responses and raw rows; `any` is the honest type there.
  files: ['test/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off'
  }
})
