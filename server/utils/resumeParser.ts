/**
 * Deterministic Resume Parser
 * Extracts candidate information from raw resume text using regex patterns.
 * Zero LLM calls — pure string matching.
 */

const extractEmail = (text: string): string => {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const matches = text.match(emailRegex)
  if (!matches || matches.length === 0) return 'N/A'

  const blacklist = ['example.com', 'email.com', 'domain.com', 'test.com', 'yourmail.com']
  const valid = matches.filter(e => !blacklist.some(b => e.toLowerCase().includes(b)))

  return valid.length > 0 ? valid[0]!.toLowerCase() : matches[0]!.toLowerCase()
}

const extractPhone = (text: string): string => {
  const patterns = [
    /(?:\+91[\s\-]?|91[\s\-]|0)?[6-9]\d{4}[\s\-]?\d{5}/g,
    /\+?\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g,
    /(?:phone|mobile|cell|contact|tel|ph)[\s:.\-]*(\+?\d[\d\s\-()]{8,15}\d)/gi
  ]

  for (const pattern of patterns) {
    const matches = text.match(pattern)
    if (matches) {
      const cleaned = matches[0]!.replace(/[^\d+\-() ]/g, '').trim()
      if (cleaned.replace(/\D/g, '').length >= 10) {
        return cleaned
      }
    }
  }
  return 'N/A'
}

const extractName = (text: string): string => {
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0)

  for (const line of lines.slice(0, 5)) {
    if (/^(resume|curriculum|cv|profile|contact|address|email|phone|mobile|objective|summary)/i.test(line)) continue
    if (/^(http|www\.|.*@)/i.test(line)) continue
    if ((line.match(/[^a-zA-Z\s.]/g) || []).length > 2) continue

    const words = line.split(/\s+/).filter(w => w.length > 0)
    if (words.length >= 1 && words.length <= 5) {
      const lettersOnly = line.replace(/[^a-zA-Z\s]/g, '').trim()
      if (lettersOnly.length >= 3) {
        return lettersOnly
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
      }
    }
  }
  return 'Unknown'
}

const extractExperience = (text: string): string => {
  const patterns = [
    /(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/gi,
    /(?:experience|exp)[\s:]*(\d{1,2})\+?\s*(?:years?|yrs?)/gi,
    /(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:in|of|working)/gi
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match && match[1]) {
      const years = parseInt(match[1])
      if (years > 0 && years < 50) {
        return `${years} years`
      }
    }
  }
  return 'N/A'
}

const extractLocation = (text: string): string => {
  const patterns = [
    /(?:location|address|city|based in|residing)[\s:]*([A-Za-z][A-Za-z,\s]{3,40})/gi,
    /(?:,\s*)((?:Delhi|Mumbai|Bangalore|Bengaluru|Hyderabad|Chennai|Kolkata|Pune|Noida|Gurugram|Gurgaon|Jaipur|Ahmedabad|Lucknow|Chandigarh|Indore|Bhopal|Kochi|Thiruvananthapuram|Coimbatore|Nagpur|Patna|Ghaziabad|Ranchi|Bhubaneswar|Dehradun|Visakhapatnam)[A-Za-z,\s]{0,30})/gi
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match && match[1]) {
      return match[1].trim().substring(0, 60)
    }
  }

  const cities = ['Delhi', 'Mumbai', 'Bangalore', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Noida', 'Gurugram', 'Gurgaon', 'Jaipur', 'Ahmedabad', 'Lucknow', 'Chandigarh', 'Indore', 'Bhopal', 'Kochi', 'Coimbatore', 'Nagpur', 'Patna', 'Ghaziabad', 'Ranchi', 'Bhubaneswar', 'Dehradun', 'New York', 'San Francisco', 'London', 'Singapore', 'Dubai', 'Toronto', 'Berlin', 'Tokyo', 'Sydney']
  for (const city of cities) {
    if (text.toLowerCase().includes(city.toLowerCase())) {
      return city
    }
  }

  return 'N/A'
}

const extractCTC = (text: string): string => {
  const patterns = [
    /(?:current\s*)?(?:ctc|salary|compensation|package)[\s:]*(?:(?:INR|Rs\.?|₹)\s*)?(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lacs?|L|cr|crore)/gi,
    /(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lacs?)\s*(?:ctc|salary|pa|per\s*annum)/gi
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match && match[1]) {
      const amount = parseFloat(match[1])
      if (amount > 0 && amount < 500) {
        return `${amount} LPA`
      }
    }
  }
  return 'N/A'
}

interface ResumeSections {
  skills: string
  projects: string
  experience: string
}

export const extractSections = (text: string): ResumeSections => {
  const sections: ResumeSections = { skills: '', projects: '', experience: '' }
  const lines = text.split('\n')
  let currentSection: keyof ResumeSections | null = null

  const sectionHeaders: Record<keyof ResumeSections, RegExp> = {
    skills: /^(?:skills|technical\s*skills|core\s*skills|key\s*skills|technologies|tech\s*stack|proficiency)/i,
    projects: /^(?:projects|personal\s*projects|academic\s*projects|key\s*projects|notable\s*projects)/i,
    experience: /^(?:experience|work\s*experience|professional\s*experience|employment|work\s*history)/i
  }

  const isHeader = (line: string): boolean => {
    const trimmed = line.trim()
    return trimmed.length > 2 && trimmed.length < 60 && /^[A-Z]/.test(trimmed)
  }

  for (const line of lines) {
    const trimmed = line.trim()
    let matched = false
    for (const [sectionName, regex] of Object.entries(sectionHeaders)) {
      if (regex.test(trimmed)) {
        currentSection = sectionName as keyof ResumeSections
        matched = true
        break
      }
    }

    if (!matched && isHeader(trimmed) && /^[A-Z\s]+$/i.test(trimmed) && trimmed.length < 40) {
      if (currentSection && trimmed.length > 3) {
        currentSection = null
      }
    }

    if (currentSection && !matched) {
      sections[currentSection] += trimmed + ' '
    }
  }

  for (const key of Object.keys(sections) as Array<keyof ResumeSections>) {
    sections[key] = sections[key].trim().substring(0, 2000)
  }

  return sections
}

export const parseResume = (resumeText: string) => {
  return {
    name: extractName(resumeText),
    email: extractEmail(resumeText),
    phone: extractPhone(resumeText),
    experience_level: extractExperience(resumeText),
    current_location: extractLocation(resumeText),
    current_ctc: extractCTC(resumeText),
    sections: extractSections(resumeText)
  }
}
