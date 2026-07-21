/**
 * videoPoster — capture the first frame of a video as a JPEG blob.
 *
 * Used by VideoCompressInput to auto-fill media.posterImage from the video's
 * first frame (t≈0.1s to skip a potentially black frame 0). Pure HTML5
 * video + canvas — no FFmpeg needed; works for any codec the admin's
 * browser can decode (MP4/H.264 on Chrome in practice).
 *
 * The poster matters beyond the Studio preview: the kiosk player renders
 * posterImage as the still while a video loads (preload="none"), so a
 * missing poster = a dark screen at the start of every loop.
 */

export function fileRefToUrl(ref: string, projectId: string, dataset: string): string | null {
  if (!ref?.startsWith('file-')) return null
  const body     = ref.slice('file-'.length)
  const lastDash = body.lastIndexOf('-')
  if (lastDash === -1) return null
  return `https://cdn.sanity.io/files/${projectId}/${dataset}/${body.slice(0, lastDash)}.${body.slice(lastDash + 1)}`
}

export function captureVideoFrame(src: string, timeoutMs = 30000): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin  = 'anonymous'   // Sanity CDN sends CORS headers — needed or the canvas taints
    v.muted        = true
    v.playsInline  = true
    v.preload      = 'auto'

    let settled = false
    const cleanup = () => { v.removeAttribute('src'); try { v.load() } catch { /* noop */ } }
    const fail = (why: string) => {
      if (settled) return
      settled = true; clearTimeout(timer); cleanup()
      reject(new Error(why))
    }
    const timer = setTimeout(() => fail('โหลดวิดีโอไม่ทัน 30 วินาที'), timeoutMs)

    v.addEventListener('error', () => fail('โหลดวิดีโอไม่ได้ (codec ที่เบราว์เซอร์เล่นไม่ได้ หรือ CORS)'), { once: true })
    v.addEventListener('loadeddata', () => {
      const draw = () => {
        if (settled) return
        try {
          const c = document.createElement('canvas')
          c.width = v.videoWidth; c.height = v.videoHeight
          if (!c.width || !c.height) return fail('อ่านขนาดวิดีโอไม่ได้')
          c.getContext('2d')!.drawImage(v, 0, 0)
          c.toBlob(b => {
            settled = true; clearTimeout(timer); cleanup()
            b ? resolve(b) : reject(new Error('สร้างรูปจาก canvas ไม่สำเร็จ'))
          }, 'image/jpeg', 0.9)
        } catch (e: any) {
          fail(e?.message || 'วาดเฟรมไม่ได้ (CORS)')
        }
      }
      // Seek slightly in — frame 0 is black in a lot of real-world videos.
      const t = Math.min(0.1, (v.duration || 1) * 0.05)
      v.addEventListener('seeked', draw, { once: true })
      try { v.currentTime = t } catch { draw() }
    }, { once: true })

    v.src = src
  })
}
