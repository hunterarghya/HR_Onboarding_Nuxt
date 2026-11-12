import pdf from 'pdf-parse'

/** Plain text of a base64-encoded PDF. */
export const extractPdfText = async (base64: string): Promise<string> => {
  const parsed = await pdf(Buffer.from(base64, 'base64'))
  return parsed.text
}
