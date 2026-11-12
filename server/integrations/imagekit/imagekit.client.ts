import ImageKit from 'imagekit'
import { config } from '~~/server/config/env'

let imagekit: ImageKit | null = null

// Created on first use, so a misconfigured ImageKit can never take down unrelated routes (BUG-21)
const getImageKit = (): ImageKit => {
  imagekit ??= new ImageKit({
    publicKey: config.imagekit.publicKey,
    privateKey: config.imagekit.privateKey,
    urlEndpoint: config.imagekit.urlEndpoint
  })
  return imagekit
}

/**
 * Uploads a base64 PDF to ImageKit as a private file (SEC-10: resumes were public). Returns its path,
 * which only opens through a signed link (resumeLink), or null if the upload failed.
 */
export const uploadResume = async (base64Data: string, filename: string): Promise<string | null> => {
  try {
    console.log(`--- ImageKit: Uploading ${filename}... ---`)
    const response = await getImageKit().upload({
      file: base64Data,
      fileName: filename,
      folder: '/resumes',
      useUniqueFileName: true,
      isPrivateFile: true
    })

    console.log(`--- ImageKit: Upload successful: ${response.filePath} ---`)
    return response.filePath
  } catch (error) {
    console.error('--- ImageKit Upload Error ---', error)
    return null
  }
}

/** How long a resume link works once handed out. */
export const RESUME_LINK_SECONDS = 300

/**
 * A link that opens a stored resume for a few minutes. `file` is an ImageKit path; resumes uploaded
 * before files were private are stored as their full public URL and are returned as they are.
 */
export const resumeLink = (file: string): string =>
  /^https?:\/\//i.test(file) ? file : getImageKit().url({ path: file, signed: true, expireSeconds: RESUME_LINK_SECONDS })
