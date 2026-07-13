/**
 * PendingChangesTool — the "รอปล่อยขึ้นจอ" pipeline view.
 *
 * Workflow it enables (cost control — one deploy per review session instead of
 * one per publish):
 *   1. Editors edit content and just SAVE (leave it as a draft) — drafts never
 *      reach the kiosk bake (build.mjs reads the published perspective).
 *   2. Admin opens this tab: every pending draft across kiosk content types,
 *      grouped, with thumbnails. Review via each doc's Overview.
 *   3. Batch Publish — one click publishes the selected drafts, replaying the
 *      media playlist side-effects (add/remove-on-publish flags) exactly like
 *      the per-doc MediaPublishAction, then resetting those one-shot flags.
 *   4. Publishing NO LONGER auto-deploys — the webhook endpoint ignores
 *      Sanity's per-publish calls (?manual=1 required). This tool fires
 *      exactly ONE rebuild per batch after the publish loop, so a batch of
 *      any size costs a single Netlify build round.
 *   5. "Deploy Now" forces an immediate rebuild for urgent cases.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useClient } from 'sanity'
import { IntentLink } from 'sanity/router'
import { Badge, Box, Button, Card, Checkbox, Flex, Heading, Spinner, Stack, Text } from '@sanity/ui'

interface Row {
  _id: string
  _type: string
  _updatedAt?: string
  title?: string | null
  img?: string | null
  addFlag?: boolean | null
  removeFlag?: boolean | null
  isNew?: boolean
  scope?: string | null
  kind?: string | null
  projTitles?: Array<string | null> | null   // media/offer/buildingUpdate: projects[]
  projTitle?: string | null                  // playlistItem: project · juristic provider: projectSite
}

const TYPES = ['media', 'offer', 'provider', 'playlistItem', 'buildingUpdate']
const TYPE_TH: Record<string, string> = {
  media: '🖼 สื่อ (Media)', offer: '🎫 โฆษณา (Offer)', provider: '🏪 ร้าน (Provider)',
  playlistItem: '📋 สลอตเพลย์ลิสต์', buildingUpdate: '📌 ประกาศอาคาร',
}
// ?manual=1 is required — the endpoint ignores Sanity's automatic per-publish
// webhook calls so individual publishes never burn a rebuild; only these
// Studio buttons (and hand-run curls) start one.
const WEBHOOK_URL = 'https://app.aquamx.biz/api/sanity-webhook?manual=1'

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/* Where will this doc show? 🌍 Global / 📍 project name(s) / ⚠ scoped but no project picked.
   Mirrors the target rules in mediaPublishAction: notices use projects[] regardless of scope. */
function scopeBadge(r: Row): { label: string; tone: 'primary' | 'caution' | 'default' } | null {
  const titles = (r.projTitles ?? (r.projTitle ? [r.projTitle] : [])).filter(Boolean) as string[]
  const list = titles.slice(0, 2).join(' · ') + (titles.length > 2 ? ` +${titles.length - 2}` : '')
  if (r._type === 'playlistItem') return titles.length ? { label: `📍 ${list}`, tone: 'default' } : null
  if ((r._type === 'media' && r.kind === 'notice') || r.scope === 'project') {
    return titles.length
      ? { label: `📍 ${list}`, tone: 'default' }
      : { label: '⚠ ยังไม่เลือกโครงการ', tone: 'caution' }
  }
  if (r._type === 'media' || r._type === 'offer' || r._type === 'buildingUpdate') {
    return { label: '🌍 Global — ทุกตึก', tone: 'primary' }   // scope 'global' or unset defaults to global
  }
  return titles.length ? { label: `📍 ${list}`, tone: 'default' } : null   // juristic provider → projectSite
}

export function PendingChangesTool() {
  const client = useClient({ apiVersion: '2024-01-01' })

  const [rows, setRows]         = useState<Row[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy]         = useState(false)
  const [log, setLog]           = useState<string[]>([])
  const [deployMsg, setDeployMsg] = useState<string>('')

  const pushLog = (line: string) => setLog(l => [...l, line])

  const load = useCallback(async () => {
    setRows(null)
    const drafts = await client.fetch<Row[]>(
      `*[_id in path("drafts.**") && _type in $types] | order(_type asc, _updatedAt desc) {
        _id, _type, _updatedAt,
        "title": coalesce(title, title_th, title_en, name_th, name_en, name, media->title),
        "img": coalesce(posterImage.asset->url, primaryImage.asset->url, images[0].asset->url,
                        logo.asset->url, coverImage.asset->url, imageFiles[0].asset->url,
                        media->posterImage.asset->url),
        "addFlag": addToPlaylistOnPublish, "removeFlag": removeFromPlaylistOnPublish,
        scope, kind,
        "projTitles": projects[]->title,
        "projTitle": coalesce(project->title, projectSite->title)
      }`, { types: TYPES },
    ).catch(() => [] as Row[])
    const baseIds = drafts.map(d => d._id.replace(/^drafts\./, ''))
    const publishedIds = new Set(await client.fetch<string[]>(
      `*[!(_id in path("drafts.**")) && _id in $ids]._id`, { ids: baseIds },
    ).catch(() => [] as string[]))
    const withNew = drafts.map(d => ({ ...d, isNew: !publishedIds.has(d._id.replace(/^drafts\./, '')) }))
    setRows(withNew)
    setSelected(new Set(withNew.map(d => d._id)))   // default: everything selected
  }, [client])

  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const g: Record<string, Row[]> = {}
    for (const r of rows || []) (g[r._type] = g[r._type] || []).push(r)
    return g
  }, [rows])

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // ── media playlist side-effects (mirrors actions/mediaPublishAction.tsx) ──
  async function resolveTargets(doc: Record<string, any>): Promise<string[]> {
    const projs = (doc.projects ?? []).map((p: any) => p._ref)
    if (doc.kind === 'notice' || doc.scope === 'project') return projs
    if (doc.scope === 'global') {
      const all = await client.fetch<string[]>(`*[_type == "project" && isActive == true]._id`)
      const ex = new Set((doc.excludedProjects ?? []).map((p: any) => p._ref))
      return all.filter(id => !ex.has(id))
    }
    return []
  }

  async function addSlots(mediaId: string, targets: string[], title: string) {
    for (const p of targets) {
      const dup = await client.fetch<string | null>(
        `*[_type == "playlistItem" && media._ref == $m && project._ref == $p][0]._id`, { m: mediaId, p })
      if (dup) { pushLog(`   · ${title}: มี slot ในโครงการอยู่แล้ว — ข้าม`); continue }
      const orders = await client.fetch<number[]>(`*[_type == "playlistItem" && project._ref == $p].order`, { p })
      const next = (orders.length ? Math.max(...orders) : 0) + 10
      // published directly — the kiosk build reads published-only; a draft slot never airs
      await client.create({
        _id: crypto.randomUUID(), _type: 'playlistItem',
        project: { _type: 'reference', _ref: p },
        media:   { _type: 'reference', _ref: mediaId },
        order: next, enabled: true,
      })
      pushLog(`   · ${title}: เพิ่ม slot (order ${next})`)
    }
  }

  async function removeSlots(mediaId: string, targets: string[], title: string) {
    const slots = await client.fetch<Array<{ _id: string }>>(
      `*[_type == "playlistItem" && media._ref == $m && project._ref in $ps]{ _id }`,
      { m: mediaId, ps: targets },
    ).catch(() => [] as Array<{ _id: string }>)
    if (!slots.length) { pushLog(`   · ${title}: ไม่มี slot ให้ลบ`); return }
    const tx = client.transaction()
    slots.forEach(s => tx.delete(s._id))
    await tx.commit()
    pushLog(`   · ${title}: ลบ ${slots.length} slot`)
  }

  // ── batch publish ──────────────────────────────────────────────────────────
  async function publishSelected() {
    if (!rows) return
    const todo = rows.filter(r => selected.has(r._id))
    if (!todo.length) return
    setBusy(true); setLog([])
    let ok = 0, fail = 0
    for (const r of todo) {
      const title = r.title || r._id.slice(0, 18)
      try {
        const draft = await client.getDocument(r._id)
        if (!draft) { pushLog(`⚠ ${title}: draft หายไปแล้ว — ข้าม`); continue }
        if (draft._type === 'media' && draft.addToPlaylistOnPublish && draft.removeFromPlaylistOnPublish) {
          pushLog(`✗ ${title}: ติ๊กทั้ง "เพิ่ม" และ "ลบ" playlist พร้อมกัน — แก้ให้เหลืออันเดียวก่อน (ข้าม)`)
          fail++; continue
        }
        const pubId = r._id.replace(/^drafts\./, '')
        const { _rev, _createdAt, _updatedAt, ...rest } = draft as Record<string, any>
        const tx = client.transaction()
        tx.createOrReplace({ ...rest, _id: pubId, _type: draft._type })
        tx.delete(r._id)
        await tx.commit()
        pushLog(`✓ ${title}: publish แล้ว`)
        if (draft._type === 'media' && (draft.addToPlaylistOnPublish || draft.removeFromPlaylistOnPublish || draft.deployOnPublish)) {
          if (draft.addToPlaylistOnPublish || draft.removeFromPlaylistOnPublish) {
            const targets = await resolveTargets(draft as Record<string, any>)
            if (draft.addToPlaylistOnPublish)    await addSlots(pubId, targets, title)
            if (draft.removeFromPlaylistOnPublish) await removeSlots(pubId, targets, title)
          }
          // deployOnPublish also resets here — the batch fires its own single
          // rebuild at the end, so the one-shot must not linger for next time
          await client.patch(pubId).set({ addToPlaylistOnPublish: false, removeFromPlaylistOnPublish: false, deployOnPublish: false }).commit()
        }
        ok++
      } catch (err: any) {
        pushLog(`✗ ${title}: ${err?.message ?? String(err)}`)
        fail++
      }
    }
    pushLog(`— เสร็จ: สำเร็จ ${ok} · พลาด ${fail} —`)
    if (ok > 0) {
      // one rebuild for the whole batch — individual publishes cost nothing
      pushLog('📡 กำลังสั่งส่งขึ้นจอ (รอบเดียวสำหรับทั้งชุด)…')
      const r = await triggerRebuild()
      pushLog(r === 'fail'
        ? '⚠ publish สำเร็จแล้ว แต่สั่งส่งขึ้นจอไม่ผ่าน — กดปุ่ม "Deploy Now" อีกครั้ง'
        : '✅ ส่งขึ้นจอแล้ว — จอทุกตึกได้ของใหม่ภายใน ~5 นาที ไม่ต้องกดอะไรต่อ')
    }
    setBusy(false)
    load()
  }

  // Fire ONE rebuild. Returns 'ok' (confirmed), 'sent' (fired, response
  // unreadable), or 'fail' (couldn't reach the endpoint).
  async function triggerRebuild(): Promise<'ok' | 'sent' | 'fail'> {
    try {
      const res = await fetch(WEBHOOK_URL, { method: 'POST' })
      const out = await res.json().catch(() => null)
      return out?.success ? 'ok' : 'fail'
    } catch {
      try { await fetch(WEBHOOK_URL, { method: 'POST', mode: 'no-cors' }); return 'sent' }
      catch { return 'fail' }
    }
  }

  async function deployNow() {
    setDeployMsg('⏳ กำลังสั่ง rebuild…')
    try {
      const res = await fetch(WEBHOOK_URL, { method: 'POST' })
      const out = await res.json().catch(() => null)
      setDeployMsg(out?.success
        ? '✅ สั่งส่งขึ้นจอสำเร็จ — กำลังอบ build อยู่หลังบ้าน จอทุกตึกได้ของใหม่ใน ~3-5 นาที · หน้านี้จะไม่มีอะไรเปลี่ยน (รายการ draft ยังอยู่ เพราะปุ่มนี้ไม่ได้ publish อะไรให้) · หมายเหตุ: publish รายตัวใน Studio จะยังไม่ขึ้นจอจนกว่าจะกดปุ่มนี้หรือ Publish ที่เลือก'
        : `✗ ${JSON.stringify(out)}`)
    } catch {
      // no-cors fallback: fire-and-forget when the browser blocks reading the response
      try { await fetch(WEBHOOK_URL, { method: 'POST', mode: 'no-cors' }); setDeployMsg('✓ ส่งคำสั่งแล้ว (ยืนยันผลไม่ได้ — ดูที่ GitHub Actions)') }
      catch { setDeployMsg('✗ เรียกไม่สำเร็จ — เช็คเน็ต/endpoint') }
    }
  }

  const total = rows?.length ?? 0
  const nSel  = selected.size

  return (
    <Box padding={4} style={{ maxWidth: 860, margin: '0 auto' }}>
      <Stack space={4}>
        <Heading size={3}>🗂 Pending Publish — รอปล่อยขึ้นจอ</Heading>

        <Card padding={3} radius={3} tone="primary">
          <Stack space={3}>
            <Text size={1}>
              <b>วิธีใช้:</b> ① แก้เนื้อหาแล้ว<b>ปล่อยเป็น Draft ไว้</b> (ยังไม่ขึ้นจอ ไม่เปลือง build) →
              ② มารีวิวรวมที่หน้านี้ → ③ ติ๊กเลือกแล้วกด <b>🚀 Publish ที่เลือก</b> — <b>จบแค่นี้</b>
              ระบบจะส่งขึ้นจอทุกตึกให้เอง ภายใน ~5 นาที <b>ไม่ต้องกดปุ่มอื่นต่อ</b>
            </Text>
            <Text size={1} muted>
              📡 Deploy Now = <b>ส่งของที่ publish แล้วขึ้นจอทันที</b> — ตอนนี้การกด Publish รายตัวจากหน้าเอกสาร
              <b>จะยังไม่ขึ้นจอ</b> (ประหยัดรอบ build) สะสมกี่รายการก็ได้ แล้วค่อยกดปุ่มนี้ครั้งเดียว
              · ใช้ซ้ำได้ถ้าจอไม่อัปเดตหลัง publish ชุด · ปุ่มนี้ไม่ได้ publish อะไรให้
            </Text>
          </Stack>
        </Card>

        <Flex gap={2} align="center" wrap="wrap">
          <Button text="รีเฟรช" mode="ghost" onClick={load} disabled={busy} />
          <Button text={nSel === total && total > 0 ? 'ไม่เลือกทั้งหมด' : 'เลือกทั้งหมด'} mode="ghost" disabled={busy || total === 0}
            onClick={() => setSelected(nSel === total ? new Set() : new Set((rows || []).map(r => r._id)))} />
          <Box flex={1} />
          <Button text={`🚀 Publish ที่เลือก (${nSel})`} tone="positive" disabled={busy || nSel === 0} onClick={publishSelected} />
          <Button text="📡 Deploy Now (ปุ่มสำรอง)" mode="ghost" tone="caution" disabled={busy} onClick={deployNow}
            title="บังคับส่งขึ้นจอรอบใหม่ — ใช้เมื่อ publish แล้วจอไม่อัปเดตใน ~10 นาที · ไม่ได้ publish อะไรให้" />
        </Flex>
        {deployMsg && (
          <Card padding={3} radius={3} tone={deployMsg.startsWith('✗') ? 'critical' : 'positive'}>
            <Text size={1}>{deployMsg}</Text>
          </Card>
        )}

        {log.length > 0 && (
          <Card padding={3} radius={3} tone="transparent" border>
            <Stack space={2}>
              {log.map((l, i) => <Text key={i} size={1} style={{ fontFamily: 'monospace' }}>{l}</Text>)}
            </Stack>
          </Card>
        )}

        {rows === null ? (
          <Flex justify="center" padding={5}><Spinner /></Flex>
        ) : total === 0 ? (
          <Card padding={4} radius={3} tone="positive">
            <Text>✅ ไม่มีงานค้าง — ทุกการแก้ไข publish หมดแล้ว</Text>
          </Card>
        ) : (
          Object.entries(groups).map(([type, list]) => (
            <Stack key={type} space={3}>
              <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {TYPE_TH[type] || type} — {list.length} รายการ
              </Text>
              {list.map(r => (
                <Card key={r._id} padding={3} radius={3} shadow={1}>
                  <Flex align="center" gap={3}>
                    <Checkbox checked={selected.has(r._id)} onChange={() => toggle(r._id)} disabled={busy} />
                    {r.img
                      ? <img src={`${r.img}?w=96&h=96&fit=crop&auto=format`} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      : <Box style={{ width: 44, height: 44, borderRadius: 8, background: '#12161f', flexShrink: 0 }} />}
                    <Box flex={1}>
                      <Text size={1} weight="semibold">
                        <IntentLink intent="edit" params={{ id: r._id.replace(/^drafts\./, ''), type: r._type }}>
                          {r.title || '(ไม่มีชื่อ)'}
                        </IntentLink>
                      </Text>
                      <Text size={1} muted style={{ marginTop: 3 }}>แก้ล่าสุด {fmt(r._updatedAt)}</Text>
                    </Box>
                    <Flex gap={2} align="center" wrap="wrap" justify="flex-end">
                      {(() => { const s = scopeBadge(r); return s ? <Badge tone={s.tone} mode="outline" fontSize={0}>{s.label}</Badge> : null })()}
                      {r.addFlag && <Badge tone="positive" fontSize={0}>← เข้า playlist</Badge>}
                      {r.removeFlag && <Badge tone="critical" fontSize={0}>→ ออกจาก playlist</Badge>}
                      <Badge tone={r.isNew ? 'primary' : 'caution'} fontSize={0}>{r.isNew ? '← ใหม่' : 'แก้ไข'}</Badge>
                    </Flex>
                  </Flex>
                </Card>
              ))}
            </Stack>
          ))
        )}
      </Stack>
    </Box>
  )
}
