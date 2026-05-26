import ImageKit from 'imagekit'

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || ''
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
