/** Asks the model whether an email is a job application. Must mention JSON (Groq JSON mode needs it). */
export const buildEmailClassifierPrompt = (emailSubject: string, emailBody: string): string => `
    Identify if the following email is a job application.
    Subject: ${emailSubject}
    Body: ${emailBody}
    
    Return ONLY a JSON object:
    {
      "isApplication": boolean,
      "position": "string or null"
    }
  `
