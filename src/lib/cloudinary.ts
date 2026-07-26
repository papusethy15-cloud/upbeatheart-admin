// ── lib/cloudinary.ts ──────────────────────────────────────────────────────
// Cloudinary upload utilities for UpBeat Heart admin dashboard

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string

export interface CloudinaryResult {
  url:       string
  publicId:  string
  width:     number
  height:    number
  bytes:     number
  format:    string
  duration?: number   // seconds — video only
  thumbnailUrl?: string
}

/**
 * Unsigned upload (images, infographics).
 * Uses an unsigned Cloudinary upload preset.
 */
export async function uploadToCloudinary(
  file: File,
  preset: string,
  onProgress?: (pct: number) => void,
): Promise<CloudinaryResult> {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`
  const fd  = new FormData()
  fd.append('file',           file)
  fd.append('upload_preset',  preset)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const d = JSON.parse(xhr.responseText)
        resolve({
          url:          d.secure_url,
          publicId:     d.public_id,
          width:        d.width        ?? 0,
          height:       d.height       ?? 0,
          bytes:        d.bytes        ?? 0,
          format:       d.format       ?? '',
          duration:     d.duration,
          thumbnailUrl: d.resource_type === 'video'
            ? d.secure_url.replace(/\.[^.]+$/, '.jpg')
            : undefined,
        })
      } else {
        reject(new Error(`Cloudinary upload failed: ${xhr.responseText}`))
      }
    }

    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(fd)
  })
}

/**
 * Fetch YouTube video metadata via oEmbed (no API key needed).
 */
export async function fetchYouTubeMeta(youtubeUrl: string): Promise<{
  title:        string
  thumbnailUrl: string
  description:  string
}> {
  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`
  const res    = await fetch(oembed)
  if (!res.ok) throw new Error('Could not fetch YouTube metadata')
  const d = await res.json()
  return {
    title:        d.title        ?? '',
    thumbnailUrl: d.thumbnail_url ?? '',
    description:  d.author_name  ?? '',
  }
}

/**
 * Generate a URL-safe slug from a title string.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
