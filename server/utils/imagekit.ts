import ImageKit from 'imagekit'
import { config } from '~~/server/config/env'

const imagekit = new ImageKit({
  publicKey: config.imagekit.publicKey,
  privateKey: config.imagekit.privateKey,
  urlEndpoint: config.imagekit.urlEndpoint
})

/**
 * Uploads a base64 PDF to ImageKit
 */
export const uploadResume = async (base64Data: string, filename: string): Promise<string | null> => {
  try {
    console.log(`--- ImageKit: Uploading ${filename}... ---`)
    const response = await imagekit.upload({
      file: base64Data,
      fileName: filename,
      folder: '/resumes',
      useUniqueFileName: true
    })

    console.log(`--- ImageKit: Upload successful! URL: ${response.url} ---`)
    return response.url
  } catch (error) {
    console.error('--- ImageKit Upload Error ---', error)
    return null
  }
}
