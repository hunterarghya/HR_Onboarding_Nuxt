import '@tiptap/core'

// Registers the command added by the custom Underline mark in pages/templates.vue
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    underline: {
      toggleUnderline: () => ReturnType
    }
  }
}
