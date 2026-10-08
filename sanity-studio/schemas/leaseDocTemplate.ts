import { defineField, defineType, defineArrayMember } from 'sanity'
import { contractClause } from './adContractTemplate'

/**
 * Lease Document Template — the wording of the Rent Space quotation (ใบเสนอราคา
 * ค่าเช่าพื้นที่ติดตั้งจอโฆษณา) and lease agreement (สัญญาเช่าพื้นที่เพื่อติดตั้ง
 * จอโฆษณา), Thai and English, versioned exactly like the Ad Contract Template
 * (8 Oct 2026). The documents are printed by the app at /lease-quotation/<id>
 * and /lease-contract/<id> in the same form as the advertising documents —
 * the Google Docs templates are no longer used for Rent Space.
 *
 * Placeholders, filled when printed:
 *   {lessee} {lesseeTaxId} {lesseeAddress}                     — aquamx
 *   {lessor} {lessorAddress} {projectTh} {projectEn}            — the juristic person / project
 *   {location} {rent} {electricity} {months} {startDate} {endDate}
 *   {lessorEmail} {lessorPhone} {contractNumber} {quotationNumber}
 *   {screenInch} {screenH} {screenW} {unitH} {unitW} {unitD} {lessorMinutes}
 */
const frozen = ({ document }: { document?: any }) => !!document?.status && document.status !== 'draft'

const termRow = defineArrayMember({
  type: 'object', name: 'leaseTermRow', title: 'Row',
  fields: [
    defineField({ name: 'label', title: 'Label', type: 'string', validation: Rule => Rule.required() }),
    defineField({ name: 'value', title: 'Value', type: 'text', rows: 2, description: 'Placeholders allowed.', validation: Rule => Rule.required() }),
    defineField({ name: 'emphasis', title: 'Bold', type: 'boolean', initialValue: false }),
  ],
  preview: { select: { title: 'label', subtitle: 'value' } },
})

const quotationWording = (name: string, title: string) => defineField({
  name, title, type: 'object', readOnly: frozen, options: { collapsible: true, collapsed: true },
  fields: [
    defineField({ name: 'title',   title: 'Document title', type: 'string' }),
    defineField({ name: 'intro',   title: 'Opening paragraph', type: 'text', rows: 4 }),
    defineField({ name: 'terms',   title: 'Terms & details rows', type: 'array', of: [termRow] }),
    defineField({ name: 'lineLabel', title: 'Price line label', type: 'string', description: 'e.g. ค่าเช่าพื้นที่ติดตั้งจอโฆษณา (ต่อเดือน)' }),
    defineField({ name: 'note',    title: 'Note under the total', type: 'text', rows: 2, description: 'Replaces the advertising withholding-tax line, e.g. electricity billed on actual use.' }),
    defineField({ name: 'closing', title: 'Closing paragraph', type: 'text', rows: 3 }),
    defineField({ name: 'acceptHint', title: 'Acceptance box hint', type: 'text', rows: 2 }),
  ],
})
const contractWording = (name: string, title: string) => defineField({
  name, title, type: 'object', readOnly: frozen, options: { collapsible: true, collapsed: true },
  fields: [
    defineField({ name: 'title',   title: 'Document title', type: 'string' }),
    defineField({ name: 'intro',   title: 'Opening paragraph', type: 'text', rows: 5, description: 'The "สัญญาฉบับนี้ทำขึ้นระหว่าง …" paragraph. Placeholders allowed.' }),
    defineField({ name: 'clauses', title: 'Clauses', type: 'array', of: [contractClause] }),
    defineField({ name: 'closing', title: 'Closing line', type: 'text', rows: 2 }),
    defineField({ name: 'lessorLabel', title: 'Lessor signature label', type: 'string', description: 'e.g. ผู้ให้เช่า / Lessor' }),
    defineField({ name: 'lesseeLabel', title: 'Lessee signature label', type: 'string' }),
    defineField({ name: 'lessorTitle', title: 'Lessor signatory title', type: 'string', description: 'e.g. ผู้จัดการนิติบุคคล / Condominium Juristic Manager' }),
    defineField({ name: 'witnessLabel', title: 'Witness label', type: 'string' }),
  ],
})

export default defineType({
  name:  'leaseDocTemplate',
  title: 'Lease Document Template',
  type:  'document',
  fields: [
    defineField({ name: 'version', title: 'Version', type: 'number', validation: Rule => Rule.required().integer().min(1), readOnly: frozen }),
    defineField({
      name: 'status', title: 'Status', type: 'string', initialValue: 'draft',
      options: { list: [
        { title: '📝 Draft — being edited',                       value: 'draft'   },
        { title: '✅ Active — documents are printed with this',    value: 'active'  },
        { title: '🗄 Retired — kept for the record',               value: 'retired' },
      ], layout: 'radio' },
      description: 'Keep exactly one version Active. A document prints with the version active when it is generated.',
    }),
    defineField({ name: 'effectiveDate', title: 'Effective From', type: 'date', readOnly: frozen }),
    defineField({ name: 'changeNote', title: 'What Changed', type: 'text', rows: 2, readOnly: frozen }),
    quotationWording('quotationTh', 'Quotation — Thai'),
    quotationWording('quotationEn', 'Quotation — English'),
    contractWording('contractTh', 'Lease agreement — Thai'),
    contractWording('contractEn', 'Lease agreement — English'),
    defineField({ name: 'screenInch', title: 'Screen size (inch)', type: 'number', initialValue: 43, readOnly: frozen }),
    defineField({ name: 'screenH', title: 'Screen height (mm)', type: 'number', initialValue: 941, readOnly: frozen }),
    defineField({ name: 'screenW', title: 'Screen width (mm)', type: 'number', initialValue: 529, readOnly: frozen }),
    defineField({ name: 'unitH', title: 'Unit height (mm)', type: 'number', initialValue: 1800, readOnly: frozen }),
    defineField({ name: 'unitW', title: 'Unit width (mm)', type: 'number', initialValue: 599, readOnly: frozen }),
    defineField({ name: 'unitD', title: 'Unit depth (mm)', type: 'number', initialValue: 460, readOnly: frozen }),
    defineField({ name: 'lessorMinutes', title: 'Lessor announcement minutes / day', type: 'number', initialValue: 60, readOnly: frozen }),
    defineField({ name: 'quotationValidDays', title: 'Quotation valid for (days)', type: 'number', initialValue: 30, readOnly: frozen }),
  ],
  orderings: [{ title: 'Version — Newest', name: 'verDesc', by: [{ field: 'version', direction: 'desc' }] }],
  preview: {
    select: { version: 'version', status: 'status', effectiveDate: 'effectiveDate', changeNote: 'changeNote' },
    prepare: ({ version, status, effectiveDate, changeNote }: any) => ({
      title:    `${status === 'active' ? '✅' : status === 'retired' ? '🗄' : '📝'} Lease Document Template v${version ?? '?'}`,
      subtitle: [effectiveDate, changeNote].filter(Boolean).join(' · '),
    }),
  },
})
