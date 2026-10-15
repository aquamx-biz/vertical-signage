/**
 * ReceiptsArrayInput
 *
 * Inline (no modal) replacement for the default array editor on the
 * 2.10 · Receipts / Tax Invoices field.
 *
 * Why: Sanity's default array-of-objects opens each item in a React Portal
 * dialog, which sits outside the main DOM tree and blocks automation tools
 * (Cowork's find/read_page) from reaching the file input. This component
 * renders all items inline so every input is always in the main tree with a
 * stable data-testid that automation can target.
 *
 * Data shape is identical to the schema — no migration needed.
 * Uses client.patch(draftId) directly, same pattern as BillingPeriodsInput.
 */

import { useState, useCallback }   from 'react'
import { useClient, useFormValue } from 'sanity'
import type { ArrayOfObjectsInputProps } from 'sanity'
import { Stack, Card, Flex, Text, Button, TextInput, Spinner, Badge, Box } from '@sanity/ui'

interface ReceiptItem {
  _key:          string
  _type:         string
  file?:         { _type: 'file'; asset?: { _type: 'reference'; _ref: string } }
  receiptDate?:  string
  invoiceNumber?: string
}

function newKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Constructs a Sanity CDN URL from an asset _ref.
 * File IDs:  file-{sha1}-{ext}              → files/{sha1}.{ext}
 * Image IDs: image-{sha1}-{WxH}-{ext}       → images/{sha1}-{WxH}.{ext}
 */
function assetCdnUrl(ref: string): { url: string; isImage: boolean } | null {
  const base = 'https://cdn.sanity.io'
  const proj = 'awjj9g8u/production'

  const fileMatch  = ref.match(/^file-([a-f0-9]+)-(\w+)$/)
  if (fileMatch) {
    return { url: `${base}/files/${proj}/${fileMatch[1]}.${fileMatch[2]}`, isImage: false }
  }
  const imageMatch = ref.match(/^image-([a-f0-9]+-\d+x\d+)-(\w+)$/)
  if (imageMatch) {
    return { url: `${base}/images/${proj}/${imageMatch[1]}.${imageMatch[2]}`, isImage: true }
  }
  return null
}

export function ReceiptsArrayInput(props: ArrayOfObjectsInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const rawId  = useFormValue(['_id']) as string | undefined
  const draftId = rawId
    ? (rawId.startsWith('drafts.') ? rawId : `drafts.${rawId}`)
    : undefined

  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const items = (props.value ?? []) as ReceiptItem[]

  // ── Add ──────────────────────────────────────────────────────────────────────

  const addItem = useCallback(async () => {
    if (!draftId) return
    await client
      .patch(draftId)
      .setIfMissing({ receipts: [] })
      .append('receipts', [{ _key: newKey(), _type: 'invoiceReceipt' }])
      .commit({ autoGenerateArrayKeys: true })
  }, [client, draftId])

  // ── Remove ───────────────────────────────────────────────────────────────────

  const removeItem = useCallback(async (key: string) => {
    if (!draftId) return
    await client
      .patch(draftId)
      .unset([`receipts[_key=="${key}"]`])
      .commit()
  }, [client, draftId])

  // ── Update text field ────────────────────────────────────────────────────────

  const setField = useCallback(async (key: string, field: string, value: string | undefined) => {
    if (!draftId) return
    if (value) {
      await client.patch(draftId).set({ [`receipts[_key=="${key}"].${field}`]: value }).commit()
    } else {
      await client.patch(draftId).unset([`receipts[_key=="${key}"].${field}`]).commit()
    }
  }, [client, draftId])

  // ── Upload file ──────────────────────────────────────────────────────────────

  const handleFile = useCallback(async (item: ReceiptItem, file: File) => {
    if (!draftId) return
    setBusy(b => ({ ...b, [item._key]: true }))
    try {
      const asset   = await client.assets.upload('file', file, { filename: file.name })
      const fileRef = { _type: 'file', asset: { _type: 'reference', _ref: asset._id } }
      await client
        .patch(draftId)
        .set({ [`receipts[_key=="${item._key}"].file`]: fileRef })
        .commit()
    } catch (err) {
      console.error('[ReceiptsArrayInput] upload failed:', err)
    } finally {
      setBusy(b => ({ ...b, [item._key]: false }))
    }
  }, [client, draftId])

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!draftId) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1} muted>Save the document once before adding receipts.</Text>
      </Card>
    )
  }

  return (
    <Stack space={3}>

      {items.map((item, idx) => {
        const isUploading = !!busy[item._key]
        const hasFile     = !!item.file?.asset?._ref

        return (
          <Card key={item._key} padding={3} radius={2} border tone={hasFile ? 'transparent' : 'caution'}>
            <Stack space={3}>

              {/* File row */}
              <Flex align="center" gap={3}>
                <Box flex={1}>
                  <label style={{ display: 'block', cursor: isUploading ? 'default' : 'pointer' }}>
                    <Card padding={2} radius={2} border tone="transparent" style={{ textAlign: 'center' }}>
                      {isUploading ? (
                        <Flex align="center" justify="center" gap={2}>
                          <Spinner muted />
                          <Text size={1} muted>Uploading…</Text>
                        </Flex>
                      ) : hasFile ? (
                        <Flex align="center" gap={2}>
                          <Badge tone="positive" mode="outline" fontSize={0}>✓ Uploaded</Badge>
                          <Text size={1} muted>Click to replace</Text>
                        </Flex>
                      ) : (
                        <Text size={1} muted>📎 Click to upload  ·  .pdf or image</Text>
                      )}
                    </Card>
                    {/* Native input kept in DOM (not display:none) so automation
                        tools can locate it by data-testid and dispatch a change event */}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.heic,image/*"
                      data-testid={idx === 0 ? 'receipt-file-input' : `receipt-file-input-${idx}`}
                      style={{ opacity: 0, position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
                      disabled={isUploading}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) handleFile(item, f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </Box>

                <Button
                  mode="ghost"
                  tone="critical"
                  text="×"
                  aria-label="Remove receipt"
                  data-testid={idx === 0 ? 'receipt-remove-btn' : `receipt-remove-btn-${idx}`}
                  fontSize={2}
                  padding={2}
                  style={{ flexShrink: 0 }}
                  onClick={() => removeItem(item._key)}
                />
              </Flex>

              {/* View uploaded file */}
              {hasFile && item.file?.asset?._ref && (() => {
                const asset = assetCdnUrl(item.file!.asset!._ref)
                if (!asset) return null
                return (
                  <Flex align="center" gap={3}>
                    {asset.isImage && (
                      <a href={asset.url} target="_blank" rel="noopener noreferrer"
                        style={{ flexShrink: 0, lineHeight: 0 }}>
                        <img
                          src={asset.url}
                          alt="Receipt preview"
                          style={{
                            height: 56, maxWidth: 96, objectFit: 'contain', borderRadius: 3,
                            border: '1px solid var(--card-border-color)',
                          }}
                        />
                      </a>
                    )}
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: 'none' }}
                    >
                      <Card padding={2} radius={2} border tone="positive"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <Text size={1}>{asset.isImage ? '🖼 View image' : '📄 View file'}</Text>
                      </Card>
                    </a>
                  </Flex>
                )
              })()}

              {/* Date + Invoice number row */}
              <Flex gap={3}>
                <Stack space={1} style={{ flex: 1 }}>
                  <Text size={0} muted>Receipt Date</Text>
                  <TextInput
                    type="date"
                    data-testid={idx === 0 ? 'receipt-date-input' : `receipt-date-input-${idx}`}
                    value={item.receiptDate ?? ''}
                    onChange={e => setField(item._key, 'receiptDate', e.currentTarget.value || undefined)}
                  />
                </Stack>
                <Stack space={1} style={{ flex: 1 }}>
                  <Text size={0} muted>Invoice / Receipt No</Text>
                  <TextInput
                    data-testid={idx === 0 ? 'receipt-refno-input' : `receipt-refno-input-${idx}`}
                    placeholder="e.g. W-CS-xxx-10000785"
                    value={item.invoiceNumber ?? ''}
                    onChange={e => setField(item._key, 'invoiceNumber', e.currentTarget.value || undefined)}
                  />
                </Stack>
              </Flex>

            </Stack>
          </Card>
        )
      })}

      {items.length === 0 && (
        <Card padding={3} radius={2} border tone="caution">
          <Text size={1} muted>No receipts yet — click below to add one.</Text>
        </Card>
      )}

      <Button
        mode="ghost"
        tone="primary"
        text="+ Add receipt"
        data-testid="receipt-add-button"
        onClick={addItem}
      />

    </Stack>
  )
}
