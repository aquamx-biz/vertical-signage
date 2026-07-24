/**
 * VideoCompressInput
 *
 * Wraps the native Sanity file input for the `videoFile` field.
 * - Shows native upload normally (small files, or whenever the user prefers).
 * - Adds an optional "Compress large video" section below.
 *   - If file > 15 MB: warns and offers one-click compression via FFmpeg.wasm.
 *   - FFmpeg WASM is loaded from the studio's own assets (bundled via Vite's
 *     new URL() pattern — no external CDN, no CSP issues).
 *   - After compression the component uploads the result with client.assets.upload().
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { Stack, Button, Spinner, Flex, Text, Card, Badge } from '@sanity/ui'
import { set }                                  from 'sanity'
import { useClient, useFormValue, useDocumentOperation } from 'sanity'
import { captureVideoFrame, fileRefToUrl, probeVideoDims } from './videoPoster'

const TARGET_MB    = 15
const TARGET_BYTES = TARGET_MB * 1024 * 1024
const PROJECT_ID   = 'awjj9g8u'
const DATASET      = 'production'
// Kiosk decode envelope: cheap fleet SoCs (ZC-H358S) hard-cap H.264 decode at
// a 1080×1920 box — anything bigger plays on desktop but dies on those boxes.
const MAX_W = 1080
const MAX_H = 1920

function fmt(bytes: number) {
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`
}

// Props compatible with Sanity file field custom input
type Props = {
  renderDefault: (props: any) => React.ReactNode
  onChange:      (patch: any) => void
  value?:        Record<string, unknown>
}

export function VideoCompressInput(props: Props) {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const fileRef = useRef<HTMLInputElement>(null)

  const [file,     setFile]     = useState<File | null>(null)
  const [phase,    setPhase]    = useState<'idle' | 'compressing' | 'uploading' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [msg,      setMsg]      = useState('')
  const [errMsg,   setErrMsg]   = useState('')

  // ── Auto poster: capture the video's first frame into media.posterImage ──
  // The kiosk uses posterImage as the still while the video loads
  // (preload="none") — no poster = dark screen at the start of every loop.
  // Runs once automatically whenever a video exists and the poster is empty
  // (covers both fresh uploads and older docs opened for editing); the
  // 📸 button re-captures on demand (overwrites).
  const rawId     = useFormValue(['_id']) as string | undefined
  const docId     = (rawId ?? '').replace(/^drafts\./, '')
  const { patch } = useDocumentOperation(docId || 'placeholder', 'media')
  const posterRef = useFormValue(['posterImage', 'asset', '_ref']) as string | undefined
  const videoRef  = (props.value as any)?.asset?._ref as string | undefined

  const [posterPhase, setPosterPhase] = useState<'idle' | 'capturing' | 'done' | 'error'>('idle')
  const [posterMsg,   setPosterMsg]   = useState('')
  const autoTried = useRef<string | null>(null)

  const capturePoster = useCallback(async (overwrite: boolean) => {
    if (!videoRef) return
    if (posterRef && !overwrite) return
    const url = fileRefToUrl(videoRef, PROJECT_ID, DATASET)
    if (!url) return
    setPosterPhase('capturing')
    setPosterMsg('กำลังแคปเฟรมแรกจากวิดีโอเป็นภาพปก…')
    try {
      const blob  = await captureVideoFrame(url)
      const asset = await client.assets.upload('image', blob, {
        filename:    'video-poster-auto.jpg',
        contentType: 'image/jpeg',
      })
      patch.execute([{ set: { posterImage: { _type: 'image', asset: { _type: 'reference', _ref: asset._id } } } }])
      setPosterPhase('done')
      setPosterMsg('ตั้งภาพปกจากเฟรมแรกให้แล้ว — เปลี่ยนเป็นรูปอื่นได้ที่ช่องภาพปก')
    } catch (e: any) {
      setPosterPhase('error')
      setPosterMsg(e?.message ?? 'แคปเฟรมไม่สำเร็จ')
    }
  }, [videoRef, posterRef, client, patch])

  useEffect(() => {
    if (!videoRef || posterRef) return
    if (autoTried.current === videoRef) return   // one silent attempt per video asset
    autoTried.current = videoRef
    capturePoster(false)
  }, [videoRef, posterRef, capturePoster])

  // ── Auto-normalize: EVERY video must fit the kiosk decode envelope ──────
  // Like images (auto-resized by the Sanity CDN before they reach a screen),
  // videos must never reach a box bigger than 1080×1920: a 1210×1712 upload
  // played on desktop/RK3566 but failed fleet-wide on ZC-H358S boxes. On
  // upload — or first open of an older doc — probe the real pixels and
  // transcode down in-browser when they exceed the box. In-envelope files
  // are never touched. Vendors can upload ANY size/ratio.
  const [normPhase, setNormPhase] = useState<'idle' | 'checking' | 'working' | 'done' | 'error'>('idle')
  const [normMsg,   setNormMsg]   = useState('')
  const [normPct,   setNormPct]   = useState(0)
  const normTried    = useRef<string | null>(null)
  const recaptureFor = useRef<string | null>(null)

  async function loadFFmpeg(onProgress: (pct: number) => void) {
    const { FFmpeg }    = await import('@ffmpeg/ffmpeg')
    const { fetchFile } = await import('@ffmpeg/util')
    const ffmpeg = new FFmpeg()
    ffmpeg.on('progress', ({ progress: p }) => onProgress(Math.round(p * 100)))
    const coreURL = new URL('../node_modules/@ffmpeg/core-st/dist/esm/ffmpeg-core.js', import.meta.url).href
    const wasmURL = new URL('../node_modules/@ffmpeg/core-st/dist/esm/ffmpeg-core.wasm', import.meta.url).href
    await ffmpeg.load({ coreURL, wasmURL })
    return { ffmpeg, fetchFile }
  }

  useEffect(() => {
    if (!videoRef) return
    if (normTried.current === videoRef) return
    normTried.current = videoRef
    const url = fileRefToUrl(videoRef, PROJECT_ID, DATASET)
    if (!url) return
    ;(async () => {
      setNormPhase('checking'); setNormMsg('Checking video size…')
      try {
        const { w, h } = await probeVideoDims(url)
        if (w <= MAX_W && h <= MAX_H) { setNormPhase('idle'); setNormMsg(''); return }
        const sc = Math.min(MAX_W / w, MAX_H / h)
        const tw = Math.floor(w * sc / 2) * 2
        const th = Math.floor(h * sc / 2) * 2
        setNormPhase('working'); setNormPct(0)
        setNormMsg(`วิดีโอ ${w}×${h} เกินเพดานจอ — กำลังย่อเป็น ${tw}×${th}…`)
        const { ffmpeg, fetchFile } = await loadFFmpeg(setNormPct)
        await ffmpeg.writeFile('in.mp4', await fetchFile(url))
        await ffmpeg.exec([
          '-i', 'in.mp4',
          '-c:v', 'libx264', '-crf', '22', '-preset', 'fast',
          '-vf', `scale=${tw}:${th}`,
          '-c:a', 'aac', '-b:a', '96k',
          '-movflags', '+faststart',
          'out.mp4',
        ])
        const data = await ffmpeg.readFile('out.mp4')
        const blob = new Blob([data as Uint8Array], { type: 'video/mp4' })
        setNormMsg('Uploading normalized video…')
        const asset = await client.assets.upload('file', new File([blob], 'video-1080fit.mp4', { type: 'video/mp4' }), {
          filename: 'video-1080fit.mp4', contentType: 'video/mp4',
        })
        normTried.current    = asset._id   // our own output is in-envelope — don't re-probe
        recaptureFor.current = asset._id   // poster must match the new frames
        props.onChange(set({ _type: 'file', asset: { _type: 'reference', _ref: asset._id } }))
        setNormPhase('done')
        setNormMsg(`ย่อเป็น ${tw}×${th} แล้ว (${(blob.size / 1048576).toFixed(1)} MB) — เล่นได้ทุกกล่องในระบบ`)
      } catch (e: any) {
        setNormPhase('error')
        setNormMsg(e?.message ?? String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef])

  // After a normalize replaced the file, re-capture the poster from it.
  useEffect(() => {
    if (!videoRef || recaptureFor.current !== videoRef) return
    recaptureFor.current = null
    capturePoster(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef])

  // ── Upload compressed file to Sanity ────────────────────────────────────────
  async function doUpload(f: File) {
    setPhase('uploading')
    setMsg('Uploading to Sanity…')
    try {
      const asset = await client.assets.upload('file', f, {
        filename:    f.name,
        contentType: f.type || 'video/mp4',
      })
      props.onChange(set({ _type: 'file', asset: { _type: 'reference', _ref: asset._id } }))
      setPhase('done')
      setFile(null)
    } catch (e: any) {
      setErrMsg(`Upload failed: ${e?.message ?? 'unknown error'}`)
      setPhase('error')
    }
  }

  // ── Compress then upload ─────────────────────────────────────────────────────
  async function doCompress() {
    if (!file) return
    setPhase('compressing')
    setProgress(0)
    setErrMsg('')

    try {
      setMsg('Loading FFmpeg…')
      const { ffmpeg, fetchFile } = await loadFFmpeg(pct => {
        setProgress(pct)
        setMsg(`Compressing… ${pct}%`)
      })

      setMsg('Preparing video…')
      await ffmpeg.writeFile('input.mp4', await fetchFile(file))

      // Probe real pixels so the scale hits the SAME decode envelope as the
      // auto-normalize pass (BOTH axes — the old height-only cap let a
      // 1210-wide file through and it died on the ZC boxes).
      const vf: string[] = []
      const obj = URL.createObjectURL(file)
      try {
        const { w, h } = await probeVideoDims(obj)
        if (w > MAX_W || h > MAX_H) {
          const sc = Math.min(MAX_W / w, MAX_H / h)
          vf.push('-vf', `scale=${Math.floor(w * sc / 2) * 2}:${Math.floor(h * sc / 2) * 2}`)
        }
      } catch (e) { /* probe failed → compress without scaling */ }
      finally { URL.revokeObjectURL(obj) }

      setMsg(`Compressing to ~${TARGET_MB} MB…`)

      // CRF 28 = good quality / file-size balance.
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-c:v', 'libx264',
        '-crf', '28',
        '-preset', 'fast',
        ...vf,
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        'output.mp4',
      ])

      const data       = await ffmpeg.readFile('output.mp4')
      const blob       = new Blob([data as Uint8Array], { type: 'video/mp4' })
      const outName    = file.name.replace(/(\.\w+)?$/, '_compressed.mp4')
      const compressed = new File([blob], outName, { type: 'video/mp4' })

      setMsg(`Compressed to ${fmt(compressed.size)} — uploading…`)
      await doUpload(compressed)
    } catch (e: any) {
      const raw = e?.message ?? ''
      // Distinguish compression engine errors from upload errors
      const hint = raw.toLowerCase().includes('fetch') || raw.toLowerCase().includes('network')
        ? 'Could not load compression engine (network or security policy). Compress the video externally (e.g. HandBrake) and upload via the field above.'
        : raw || 'Compression failed'
      setErrMsg(hint)
      setPhase('error')
    }
  }

  function reset() {
    setFile(null)
    setPhase('idle')
    setProgress(0)
    setMsg('')
    setErrMsg('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const busy = phase === 'compressing' || phase === 'uploading'

  return (
    <Stack space={3}>

      {/* ── Native Sanity file input (always shown — handles normal uploads) ── */}
      {props.renderDefault(props)}

      {/* ── Auto-normalize status (kiosk decode envelope 1080×1920) ─────────── */}
      {normPhase !== 'idle' && (
        <Card padding={3} radius={2} border
          tone={normPhase === 'error' ? 'critical' : normPhase === 'done' ? 'positive' : 'primary'}>
          <Stack space={2}>
            <Flex align="center" gap={2}>
              {(normPhase === 'checking' || normPhase === 'working') && <Spinner />}
              <Text size={1} style={{ flex: 1 }}>
                {normPhase === 'done' ? `✅ ${normMsg}`
                  : normPhase === 'error' ? `❌ ย่อวิดีโออัตโนมัติไม่สำเร็จ: ${normMsg} — วิดีโอกว้างเกิน ${MAX_W}px อาจไม่เล่นบนกล่องบางรุ่น`
                  : normMsg}
              </Text>
            </Flex>
            {normPhase === 'working' && normPct > 0 && (
              <div style={{ background: 'var(--card-border-color)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ background: 'var(--card-focus-ring-color, #2276fc)', height: '100%',
                  width: `${normPct}%`, transition: 'width 0.3s ease' }} />
              </div>
            )}
          </Stack>
        </Card>
      )}

      {/* ── Video poster (first-frame capture) ───────────────────────────────── */}
      {videoRef && (
        <Card padding={3} radius={2} border
          tone={posterPhase === 'error' ? 'critical' : posterPhase === 'done' ? 'positive' : 'default'}>
          <Stack space={2}>
            <Flex align="center" gap={2} wrap="wrap">
              {posterPhase === 'capturing' && <Spinner />}
              <Text size={1} style={{ flex: 1 }}>
                {posterPhase === 'capturing' ? posterMsg
                  : posterPhase === 'done'   ? `✅ ${posterMsg}`
                  : posterPhase === 'error'  ? `❌ แคปภาพปกอัตโนมัติไม่สำเร็จ: ${posterMsg} — อัปโหลดปกเองที่ช่องภาพปก`
                  : posterRef ? '🖼️ มีภาพปกแล้ว (จอใช้เป็นภาพคั่นระหว่างรอวิดีโอโหลด)'
                  : '⚠️ ยังไม่มีภาพปก — จอจะมืดช่วงเริ่มสไลด์จนกว่าวิดีโอจะโหลด'}
              </Text>
              <Button
                text="📸 แคปภาพปกจากเฟรมแรก"
                mode="ghost" tone="primary" fontSize={1} padding={2}
                disabled={posterPhase === 'capturing'}
                onClick={() => capturePoster(true)}
              />
            </Flex>
          </Stack>
        </Card>
      )}

      {/* ── Compress section ─────────────────────────────────────────────────── */}
      <Card padding={3} radius={2} border tone="default">
        <Stack space={3}>

          <Flex align="center" gap={2}>
            <Text size={1} weight="semibold">Compress large video</Text>
            <Badge tone="primary" mode="outline" fontSize={0}>In-browser · target ~{TARGET_MB} MB</Badge>
          </Flex>

          <Text size={1} muted>
            If your video is over {TARGET_MB} MB, pick it here to compress before uploading.
          </Text>

          {/* File picker */}
          {!busy && phase !== 'done' && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setFile(f)
                  setPhase('idle')
                  setErrMsg('')
                }}
              />
              <Button
                text="📁 Pick video to compress"
                mode="ghost"
                tone="primary"
                onClick={() => fileRef.current?.click()}
              />
            </>
          )}

          {/* File info + action buttons */}
          {file && phase === 'idle' && (
            <Card
              padding={3}
              radius={2}
              border
              tone={file.size > TARGET_BYTES ? 'caution' : 'default'}
            >
              <Stack space={3}>
                <Flex align="center" justify="space-between" gap={2}>
                  <Text size={1} style={{ wordBreak: 'break-all', flex: 1 }}>{file.name}</Text>
                  <Badge
                    tone={file.size > TARGET_BYTES ? 'caution' : 'positive'}
                    mode="outline"
                    style={{ flexShrink: 0 }}
                  >
                    {fmt(file.size)}
                  </Badge>
                </Flex>

                {file.size > TARGET_BYTES ? (
                  <Text size={0} muted>
                    ⚠ Over {TARGET_MB} MB — compression recommended.
                  </Text>
                ) : (
                  <Text size={0} muted>
                    File is already under {TARGET_MB} MB. Use the upload field above directly.
                  </Text>
                )}

                <Flex gap={2} wrap="wrap">
                  {file.size > TARGET_BYTES && (
                    <Button
                      text={`🗜 Compress & Upload (~${TARGET_MB} MB)`}
                      mode="default"
                      tone="primary"
                      onClick={doCompress}
                    />
                  )}
                  <Button
                    text="Cancel"
                    mode="ghost"
                    tone="default"
                    onClick={reset}
                  />
                </Flex>
              </Stack>
            </Card>
          )}

          {/* Progress */}
          {busy && (
            <Card padding={3} radius={2} border tone="primary">
              <Stack space={2}>
                <Flex align="center" gap={2}>
                  <Spinner />
                  <Text size={1}>{msg}</Text>
                </Flex>
                {phase === 'compressing' && progress > 0 && (
                  <div style={{ background: 'var(--card-border-color)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{
                      background:  'var(--card-focus-ring-color, #2276fc)',
                      height:      '100%',
                      width:       `${progress}%`,
                      transition:  'width 0.3s ease',
                    }} />
                  </div>
                )}
              </Stack>
            </Card>
          )}

          {/* Done */}
          {phase === 'done' && (
            <Card padding={3} radius={2} border tone="positive">
              <Flex align="center" justify="space-between">
                <Text size={1}>✅ Compressed video uploaded!</Text>
                <Button text="Compress another" mode="ghost" tone="default" fontSize={1} padding={2} onClick={reset} />
              </Flex>
            </Card>
          )}

          {/* Error */}
          {phase === 'error' && (
            <Card padding={3} radius={2} border tone="critical">
              <Stack space={2}>
                <Text size={1}>❌ {errMsg}</Text>
                <Button
                  text="Try again"
                  mode="ghost"
                  tone="default"
                  onClick={() => { setErrMsg(''); setPhase('idle') }}
                />
              </Stack>
            </Card>
          )}

        </Stack>
      </Card>

    </Stack>
  )
}
