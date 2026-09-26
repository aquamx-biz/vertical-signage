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

export function quotationUrl(id?: string | null, base: 'quotation' | 'contract' = 'quotation') {
  return id ? `${HANDOFF_BASE}/${base}/${id.replace(/^drafts\./, '')}` : null
}

type Doc = { _id?: string; _type?: string; quoteNumber?: string; adContractNumber?: string }

/** Same view for the quotation and the ad contract — the page path differs. */
export function QuotationPreview(props: { document: { displayed: Doc } }) {
  const doc = props.document?.displayed
  const isContract = doc?._type === 'adContract'
  const url = quotationUrl(doc?._id, isContract ? 'contract' : 'quotation')
  const number = isContract ? doc?.adContractNumber : doc?.quoteNumber
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
            📄 Customer view — {number ?? '(no number)'}
          </Text>
          <Text size={1}>
            <a href={`${url}/pdf?staff=1`} target="_blank" rel="noreferrer">{isContract ? 'PDF ↗' : 'PDF Thai ↗'}</a>
            {isContract ? null : <>{'  ·  '}<a href={`${url}/pdf?lang=en&staff=1`} target="_blank" rel="noreferrer">PDF English ↗</a></>}
            {'  ·  '}
            <a href={`${url}?staff=1`} target="_blank" rel="noreferrer">web page ↗</a>
          </Text>
        </Flex>
        <Box style={{ height: 'calc(100vh - 160px)', minHeight: 640, border: '1px solid #e3e6ea', borderRadius: 8, overflow: 'hidden', background: '#F4F1EA' }}>
          <iframe key={url} src={`${url}?staff=1`} title="Quotation preview" style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
        </Box>
        <Flex justify="center">
          <Badge mode="outline" fontSize={0} padding={2}>Shows the PUBLISHED document only — publish, then refresh this tab</Badge>
        </Flex>
      </Stack>
    </Box>
  )
}
