import { describe, expect, it } from 'vitest'
import { renderString, renderText } from '../../server/features/templates/template-renderer'

describe('template rendering', () => {
  const data = { name: 'Asha <script>', role_applied: 'Q&A Lead', company_name: 'Odysseus' }

  it('escapes candidate data in HTML bodies', () => {
    expect(renderString('<p>Hi {{name}}, {{role_applied}}</p>', data)).toBe('<p>Hi Asha &lt;script&gt;, Q&amp;A Lead</p>')
  })

  it('keeps subjects as plain text', () => {
    expect(renderText('{{role_applied}} at {{company_name}}', data)).toBe('Q&A Lead at Odysseus')
  })

  it('leaves missing values empty', () => {
    expect(renderString('Joining: {{joining_date}}.', data)).toBe('Joining: .')
  })
})
