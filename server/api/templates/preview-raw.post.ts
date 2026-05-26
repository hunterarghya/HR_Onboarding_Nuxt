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
  const body = await readBody(event)
  const { subject, body: templateBody, type, sampleData } = body

  if (!templateBody) {
    throw createError({ statusCode: 400, statusMessage: 'body is required' })
  }

  try {
    const data = sampleData || getDefaultSampleData(type || 'custom')
    const compiledBody = Handlebars.compile(templateBody)(data)
    const compiledSubject = Handlebars.compile(subject || '')(data)

    return { subject: compiledSubject, body: compiledBody, sampleData: data }
  } catch (err: any) {
    console.error('Error previewing raw template:', err)
    throw createError({ statusCode: 500, statusMessage: 'Template compilation error', data: { details: err.message } })
  }
})
