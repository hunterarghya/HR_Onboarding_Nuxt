<script setup lang="ts">
import { Editor, EditorContent, Mark, mergeAttributes } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Handlebars from 'handlebars'
import type { EmailTemplate } from '~/types'

const Underline = Mark.create({
  name: 'underline',
  parseHTML() {
    return [
      { tag: 'u' },
      { style: 'text-decoration', getAttrs: value => value === 'underline' && null }
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['u', mergeAttributes(HTMLAttributes), 0]
  },
  addCommands() {
    return {
      toggleUnderline: () => ({ commands }) => {
        return commands.toggleMark(this.name)
      }
    }
  },
  addKeyboardShortcuts() {
    return {
      'Mod-u': () => this.editor.commands.toggleUnderline()
    }
  }
})

const { apiFetch } = useApi()
const toast = useToast()

const templates = ref<EmailTemplate[]>([])
const loading = ref(false)
const selectedTemplateId = ref<number | null>(null)
const previewMode = ref(false)
const lastFocused = ref<'subject' | 'body'>('body')

const form = reactive({
  name: '',
  subject: '',
  type: 'custom',
  body: ''
})

const editor = ref<Editor | null>(null)

// Variables for drag & drop
const variables = [
  { id: 'name', label: 'Candidate Name', format: '{{name}}' },
  { id: 'role_applied', label: 'Role Applied', format: '{{role_applied}}' },
  { id: 'offered_role', label: 'Offered Role', format: '{{offered_role}}' },
  { id: 'offered_salary', label: 'Offered Salary', format: '{{offered_salary}}' },
  { id: 'offered_location', label: 'Offered Location', format: '{{offered_location}}' },
  { id: 'joining_date', label: 'Joining Date', format: '{{joining_date}}' },
  { id: 'interview_date', label: 'Interview Date', format: '{{interview_date}}' },
  { id: 'interview_start_time', label: 'Start Time', format: '{{interview_start_time}}' },
  { id: 'interview_end_time', label: 'End Time', format: '{{interview_end_time}}' },
  { id: 'interview_mode', label: 'Mode (Online/Offline)', format: '{{interview_mode}}' },
  { id: 'venue_or_link', label: 'Venue or Link', format: '{{venue_or_link}}' }
]

const dummyData = {
  name: 'John Doe',
  role_applied: 'Senior Frontend Engineer',
  offered_role: 'Lead Frontend Engineer',
  offered_salary: '$150,000 / year',
  offered_location: 'Remote',
  joining_date: '2024-07-01',
  interview_date: '2024-06-15',
  interview_start_time: '10:00 AM',
  interview_end_time: '11:00 AM',
  interview_mode: 'online',
  venue_or_link: 'https://zoom.us/j/123456789'
}

const previewSubject = computed(() => {
  if (!form.subject) return ''
  try {
    const template = Handlebars.compile(form.subject)
    return template(dummyData)
  } catch (err) {
    return form.subject
  }
})

const previewHtml = computed(() => {
  if (!form.body) return ''
  try {
    const template = Handlebars.compile(form.body)
    return template(dummyData)
  } catch (err) {
    return 'Error compiling template: ' + (err as Error).message
  }
})

const fetchTemplates = async () => {
  loading.value = true
  try {
    templates.value = await apiFetch<EmailTemplate[]>('/templates')
  } catch (err) {
    console.error('Error fetching templates:', err)
    toast.add({ title: 'Failed to fetch templates', color: 'error' })
  } finally {
    loading.value = false
  }
}

const selectTemplate = (t: EmailTemplate) => {
  selectedTemplateId.value = t.id
  form.name = t.name
  form.subject = t.subject
  form.type = t.type
  form.body = t.body
  if (editor.value) {
    editor.value.commands.setContent(t.body)
  }
}

const createNewTemplate = () => {
  selectedTemplateId.value = null
  form.name = 'New Template'
  form.subject = ''
  form.type = 'custom'
  form.body = ''
  if (editor.value) {
    editor.value.commands.setContent('')
  }
}

const handleSave = async () => {
  if (!form.name || !form.subject || !form.body) {
    toast.add({ title: 'Name, Subject, and Body are required', color: 'warning' })
    return
  }

  const payload = {
    name: form.name,
    subject: form.subject,
    type: form.type,
    body: form.body
  }

  try {
    if (selectedTemplateId.value) {
      // Check if it's default
      const current = templates.value.find(t => t.id === selectedTemplateId.value)
      if (current?.is_default) {
        toast.add({ title: 'Cannot edit default templates', color: 'warning' })
        return
      }
      await apiFetch(`/templates/${selectedTemplateId.value}`, {
        method: 'PATCH',
        body: payload
      })
      toast.add({ title: 'Template updated', color: 'success' })
    } else {
      const res = await apiFetch<EmailTemplate>('/templates', {
        method: 'POST',
        body: payload
      })
      selectedTemplateId.value = res.id
      toast.add({ title: 'Template created', color: 'success' })
    }
    fetchTemplates()
  } catch (err) {
    console.error('Error saving template:', err)
    toast.add({ title: 'Failed to save template', color: 'error' })
  }
}

const handleDelete = async () => {
  if (!selectedTemplateId.value) return
  const current = templates.value.find(t => t.id === selectedTemplateId.value)
  if (current?.is_default) {
    toast.add({ title: 'Cannot delete default templates', color: 'warning' })
    return
  }
  if (!confirm('Are you sure you want to delete this template?')) return
  try {
    await apiFetch(`/templates/${selectedTemplateId.value}`, {
      method: 'DELETE'
    })
    toast.add({ title: 'Template deleted', color: 'success' })
    createNewTemplate()
    fetchTemplates()
  } catch (err) {
    console.error('Error deleting template:', err)
    toast.add({ title: 'Failed to delete template', color: 'error' })
  }
}

const insertVariable = (format: string) => {
  if (lastFocused.value === 'subject') {
    form.subject = (form.subject ? form.subject + ' ' : '') + format
  } else {
    if (!editor.value) return
    editor.value.chain().focus().insertContent(format).run()
  }
}

onMounted(() => {
  editor.value = new Editor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({
        placeholder: 'Write your email template here...'
      })
    ],
    content: form.body,
    onUpdate: () => {
      form.body = editor.value?.getHTML() || ''
    },
    onFocus: () => {
      lastFocused.value = 'body'
    },
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert prose-sm sm:prose-base focus:outline-none min-h-[300px] max-w-none p-4'
      }
    }
  })
  fetchTemplates()
})

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy()
  }
})

const getBadgeColor = (type: string) => {
  const map: Record<string, string> = {
    rejection: 'error',
    invite: 'primary',
    offer: 'success',
    custom: 'neutral'
  }
  return (map[type] || 'neutral') as any
}

const groupedTemplates = computed(() => {
  const groups: Record<string, EmailTemplate[]> = {
    rejection: [],
    invite: [],
    offer: [],
    custom: []
  }
  templates.value.forEach(t => {
    if (groups[t.type]) groups[t.type].push(t)
    else groups.custom.push(t)
  })
  return groups
})
</script>

<template>
  <UDashboardPanel id="templates">
    <template #header>
      <UDashboardNavbar title="Email Templates">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col lg:flex-row gap-6 h-full min-h-[calc(100vh-140px)]">
        <!-- Sidebar: Template List -->
        <div class="w-full lg:w-64 shrink-0 flex flex-col gap-4">
          <UButton
            icon="i-lucide-plus"
            label="New Template"
            color="primary"
            block
            @click="createNewTemplate"
          />

          <div class="flex-1 overflow-y-auto space-y-4">
            <div v-for="(groupTemplates, type) in groupedTemplates" :key="type">
              <div v-if="groupTemplates.length > 0">
                <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2 px-1">{{ type }}</p>
                <div class="space-y-1">
                  <button
                    v-for="t in groupTemplates"
                    :key="t.id"
                    class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                    :class="selectedTemplateId === t.id ? 'bg-[var(--ui-color-primary)]/10 text-[var(--ui-color-primary)] font-medium' : 'hover:bg-elevated'"
                    @click="selectTemplate(t)"
                  >
                    <div class="flex items-center justify-between">
                      <span class="truncate pr-2">{{ t.name }}</span>
                      <UIcon v-if="t.is_default" name="i-lucide-lock" class="size-3 text-muted shrink-0" />
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Area: Editor / Preview -->
        <div class="flex-1 flex flex-col gap-4 min-w-0">
          <UCard class="flex-1 flex flex-col" :ui="{ body: 'flex-1 flex flex-col min-h-0' }">
            <div class="flex items-center justify-between mb-4 shrink-0">
              <div class="flex gap-2">
                <UButton
                  :color="!previewMode ? 'primary' : 'neutral'"
                  :variant="!previewMode ? 'solid' : 'ghost'"
                  label="Edit"
                  icon="i-lucide-edit-3"
                  @click="previewMode = false"
                />
                <UButton
                  :color="previewMode ? 'primary' : 'neutral'"
                  :variant="previewMode ? 'solid' : 'ghost'"
                  label="Preview"
                  icon="i-lucide-eye"
                  @click="previewMode = true"
                />
              </div>
              <div class="flex gap-2">
                <UButton
                  v-if="selectedTemplateId"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  @click="handleDelete"
                />
                <UButton
                  color="primary"
                  icon="i-lucide-save"
                  label="Save"
                  @click="handleSave"
                />
              </div>
            </div>

            <!-- Edit Mode -->
            <div v-show="!previewMode" class="flex-1 flex flex-col min-h-0 gap-4">
              <div class="flex gap-4">
                <UFormField label="Template Name" class="flex-1">
                  <UInput v-model="form.name" class="w-full" />
                </UFormField>
                <UFormField label="Template Type" class="w-48">
                  <USelect
                    v-model="form.type"
                    :items="[{label: 'Custom', value: 'custom'}, {label: 'Rejection', value: 'rejection'}, {label: 'Invite', value: 'invite'}, {label: 'Offer', value: 'offer'}]"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <UFormField label="Email Subject">
                <UInput v-model="form.subject" class="w-full" @focus="lastFocused = 'subject'" />
              </UFormField>

              <!-- Editor formatting toolbar -->
              <div class="flex flex-wrap gap-1 p-1 bg-elevated/50 rounded-t-lg border border-default border-b-0 shrink-0">
                <UButton icon="i-lucide-bold" :color="editor?.isActive('bold') ? 'primary' : 'neutral'" :variant="editor?.isActive('bold') ? 'solid' : 'ghost'" size="xs" @click="editor?.chain().focus().toggleBold().run()" />
                <UButton icon="i-lucide-italic" :color="editor?.isActive('italic') ? 'primary' : 'neutral'" :variant="editor?.isActive('italic') ? 'solid' : 'ghost'" size="xs" @click="editor?.chain().focus().toggleItalic().run()" />
                <UButton icon="i-lucide-underline" :color="editor?.isActive('underline') ? 'primary' : 'neutral'" :variant="editor?.isActive('underline') ? 'solid' : 'ghost'" size="xs" @click="(editor?.chain().focus() as any).toggleUnderline().run()" />
                <UButton icon="i-lucide-strikethrough" :color="editor?.isActive('strike') ? 'primary' : 'neutral'" :variant="editor?.isActive('strike') ? 'solid' : 'ghost'" size="xs" @click="editor?.chain().focus().toggleStrike().run()" />
                <div class="w-px h-5 bg-border my-auto mx-1"></div>
                <UButton icon="i-lucide-list" :color="editor?.isActive('bulletList') ? 'primary' : 'neutral'" :variant="editor?.isActive('bulletList') ? 'solid' : 'ghost'" size="xs" @click="editor?.chain().focus().toggleBulletList().run()" />
                <UButton icon="i-lucide-list-ordered" :color="editor?.isActive('orderedList') ? 'primary' : 'neutral'" :variant="editor?.isActive('orderedList') ? 'solid' : 'ghost'" size="xs" @click="editor?.chain().focus().toggleOrderedList().run()" />
              </div>

              <!-- Tiptap Editor Content -->
              <div class="flex-1 overflow-y-auto border border-default rounded-b-lg bg-[var(--ui-bg)]">
                <editor-content :editor="editor" />
              </div>
            </div>

            <!-- Preview Mode -->
            <div v-show="previewMode" class="flex-1 flex flex-col min-h-0 bg-elevated/30 rounded-lg p-6 overflow-y-auto border border-default">
              <div class="mb-6 pb-4 border-b border-default">
                <p class="text-sm text-muted mb-1">Subject:</p>
                <p class="font-medium text-lg">{{ previewSubject || '(No Subject)' }}</p>
              </div>
              <div class="prose dark:prose-invert max-w-none" v-html="previewHtml"></div>
            </div>
          </UCard>
        </div>

        <!-- Right Panel: Variables -->
        <div class="w-full lg:w-64 shrink-0 flex flex-col gap-4">
          <UCard :ui="{ body: 'p-4' }" class="sticky top-4">
            <h3 class="font-semibold flex items-center gap-2 mb-4">
              <UIcon name="i-lucide-brackets" class="size-4" />
              Variables
            </h3>
            <p class="text-xs text-muted mb-4">
              Click to insert variables into your template. They will be replaced with real data when sending.
            </p>
            <div class="flex flex-col gap-2">
              <UButton
                v-for="v in variables"
                :key="v.id"
                color="neutral"
                variant="subtle"
                size="sm"
                class="justify-start font-mono text-xs"
                @click="insertVariable(v.format)"
              >
                {{ v.format }}
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style>
/* Tiptap styles */
.ProseMirror {
  outline: none;
}
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--ui-color-neutral-500);
  pointer-events: none;
  height: 0;
}
.ProseMirror ul {
  list-style-type: disc !important;
  padding-left: 1.5rem !important;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}
.ProseMirror ol {
  list-style-type: decimal !important;
  padding-left: 1.5rem !important;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}
.ProseMirror li p {
  margin: 0;
}
</style>
