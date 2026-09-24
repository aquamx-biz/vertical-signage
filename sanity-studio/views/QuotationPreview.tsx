/**
 * QuotationPreview — embeds the REAL customer-facing quotation page
 * (app.aquamx.co.th/quotation/<id>) inside Studio, A4-ish, with an
 * open-in-new-tab link for sending / saving as PDF.
 *
 * Same idea as WebPreview: an iframe, not a re-implementation, so the Studio
 * view and what the customer receives can never drift apart. The page serves
 * PUBLISHED documents only — publish before checking the preview.
 */
import React from 'react'
import { Badge, Box, Card, Flex, Stack, Text } from '@sanity/ui'

const HANDOFF_BASE = 'https://app.aquamx.co.th'

export function quotationUrl(id?: string | null) {
  return id ? `${HANDOFF_BASE}/quotation/${id.replace(/^drafts\./, '')}` : null
}

export function QuotationPreview(props: { document: { displayed: { _id?: string; quoteNumber?: string } } }) {
  const doc = props.document?.displayed
  const url = quotationUrl(doc?._id)
  if (!url) {
    return (
      <Card padding={3} radius={3} tone="caution">
        <Text size={1}>Save the document first — the preview needs its id.</Text>
      </Card>
    )
  }
  return (
    <Box padding={3}>
      <Stack space={3}>
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            📄 Customer view — {doc?.quoteNumber ?? '(no number)'}
          </Text>
          <Text size={1}>
            <a href={url} target="_blank" rel="noreferrer">Thai ↗</a>
            {'  ·  '}
            <a href={`${url}?lang=en`} target="_blank" rel="noreferrer">English ↗</a>
            {'  — open, then save as PDF'}
          </Text>
        </Flex>
        <Box style={{ height: 'calc(100vh - 160px)', minHeight: 640, border: '1px solid #e3e6ea', borderRadius: 8, overflow: 'hidden', background: '#F4F1EA' }}>
          <iframe key={url} src={url} title="Quotation preview" style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
        </Box>
        <Flex justify="center">
          <Badge mode="outline" fontSize={0} padding={2}>Shows the PUBLISHED document only — publish, then refresh this tab</Badge>
        </Flex>
      </Stack>
    </Box>
  )
}
