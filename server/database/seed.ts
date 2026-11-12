import { getPool } from '~~/server/core/db/pool'

// Reference data the app needs, inserted after migrations. Code rather than a migration because
// the wording depends on config (the company name).

const defaultTemplates = (company: string) => [
  {
    name: 'Rejection Mail',
    subject: `Update on Your Application at ${company}`,
    body: `<p>Hello {{name}},</p><p>Thank you for taking the time to apply at <strong>${company}</strong> for the <strong>{{role_applied}}</strong> position. After careful consideration, we have decided to move forward with other candidates.</p><p>We truly appreciate your interest and encourage you to apply again in the future.</p><p>Best regards,<br/>Team ${company}</p>`,
    type: 'rejection'
  },
  {
    name: 'Interview Invitation',
    subject: `Interview Invitation - {{role_applied}} at ${company}`,
    body: `<p>Hello {{name}},</p><p>We are pleased to inform you that you have been shortlisted for an interview for the <strong>{{role_applied}}</strong> position.</p><p>📅 <strong>Date:</strong> {{interview_date}}<br/>🕐 <strong>Time:</strong> {{interview_start_time}} - {{interview_end_time}}<br/>📍 <strong>Mode:</strong> {{interview_mode}}<br/>🔗 <strong>Venue/Link:</strong> {{venue_or_link}}</p><p>Please be on time and bring all necessary documents.</p><p>Best regards,<br/>Team ${company}</p>`,
    type: 'invite'
  },
  {
    name: 'Offer Letter',
    subject: `Offer of Employment - {{offered_role}} at ${company}`,
    body: `<p>Hello {{name}},</p><p>We are delighted to inform you that you have been selected as <strong>{{offered_role}}</strong> at <strong>${company}</strong>!</p><p>💰 <strong>CTC:</strong> {{offered_salary}}<br/>📍 <strong>Location:</strong> {{offered_location}}<br/>📅 <strong>Joining Date:</strong> {{joining_date}}</p><p>We look forward to having you on our team. Please confirm your acceptance at the earliest.</p><p>Congratulations!<br/>Team ${company}</p>`,
    type: 'offer'
  }
]

/** Inserts the default rejection / invite / offer templates, only if no default template exists yet. */
export const seedDefaultTemplates = async (companyName: string): Promise<void> => {
  const pool = getPool()
  const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*) FROM email_templates WHERE is_default = true')
  if (parseInt(rows[0]!.count) > 0) return

  for (const t of defaultTemplates(companyName)) {
    await pool.query(
      'INSERT INTO email_templates (name, subject, body, type, is_default) VALUES ($1, $2, $3, $4, true)',
      [t.name, t.subject, t.body, t.type]
    )
  }
  console.log('Default email templates seeded')
}
