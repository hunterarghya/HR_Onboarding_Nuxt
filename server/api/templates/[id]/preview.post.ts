import Handlebars from 'handlebars'

function getDefaultSampleData(type: string) {
  const base = {
    name: 'Ronit Sharma',
    email: 'ronit.sharma@email.com',
    phone: '+91 98765 43210',
    role_applied: 'Backend Developer',
    experience_level: '3 years',
    current_location: 'Bangalore',
    current_ctc: '₹8,00,000',
    score: 85
  }

  const interview = {
    interview_date: '6th May 2026',
    interview_start_time: '2:00 PM',
    interview_end_time: '5:00 PM',
    interview_mode: 'Offline (In-Person)',
    venue_or_link: 'Ripplewalk Office, 4th Floor, Sector 62, Noida'
  }

  const offer = {
    offered_role: 'Senior Backend Developer',
    offered_salary: '₹15,00,000 / year',
    offered_location: 'Bangalore',
    joining_date: '1st June 2026'
  }

  switch (type) {
    case 'rejection': return { ...base }
    case 'invite': return { ...base, ...interview }
    case 'offer': return { ...base, ...offer }
    default: return { ...base, ...interview, ...offer }
  }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const pool = usePool()

  try {
    const result = await pool.query('SELECT * FROM email_templates WHERE id = $1', [id])
    if (result.rows.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }

    const template = result.rows[0]
    const sampleData = body.sampleData || getDefaultSampleData(template.type)

    const compiledBody = Handlebars.compile(template.body)(sampleData)
    const compiledSubject = Handlebars.compile(template.subject)(sampleData)

    return { subject: compiledSubject, body: compiledBody, sampleData }
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('Error previewing template:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
