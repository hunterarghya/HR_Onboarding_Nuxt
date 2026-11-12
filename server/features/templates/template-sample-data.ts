// Placeholder values for previewing a template, by template type.

/** `companyName` is the previewing HR's own ("Your Company" until they set one). */
export const getDefaultSampleData = (type: string, companyName: string): Record<string, unknown> => {
  const base = {
    company_name: companyName,
    name: 'Ronit Sharma',
    email: 'ronit.sharma@email.com',
    phone: '+91 98765 43210',
    role_applied: 'Backend Developer',
    experience_level: '3 years',
    experience_years: 3,
    current_location: 'Bangalore',
    current_ctc: '8,00,000',
    score: 85
  }

  const interview = {
    interview_date: '6th May 2026',
    interview_start_time: '2:00 PM',
    interview_end_time: '5:00 PM',
    interview_mode: 'Offline (In-Person)',
    venue_or_link: 'Head Office, 4th Floor'
  }

  const offer = {
    offered_role: 'Senior Backend Developer',
    offered_salary: '15,00,000',
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
