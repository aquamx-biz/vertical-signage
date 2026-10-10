import { defineField, defineType, defineArrayMember } from 'sanity'

/**
 * Legal Form — every piece of legal wording the system prints, in ONE schema
 * (decided 10 Oct 2026): ad contract, Rent Space quotation / contract /
 * addendum, condo lease, lessor power of attorney. Replaces the separate
 * Ad Contract Template and Lease Document Template schemas.
 *
 * One document per form type per version. Only a Draft can be edited; once a
 * version is Active (or Retired) its wording is frozen. To change wording:
 * Duplicate the Active version, bump the version, edit, set it Active and set
 * the old one Retired. Keep exactly one Active version per form type — the
 * app prints with the Active version of the type it needs.
 *
 * Wording only. Deal data (names, figures, dates) stays on the deal documents;
 * {placeholders} in the text are filled in when the document is printed.
 * A document that copies wording (e.g. an ad contract) keeps its own copy, so
 * a new version never changes what was already issued.
 */

export const FORM_TYPES = [
  { value: 'adContract',         title: '📢 Ad Contract',               short: 'Ad Contract' },
  { value: 'rentSpaceQuotation', title: '📝 Rent Space Quotation',      short: 'Rent Space Quotation' },
  { value: 'rentSpaceContract',  title: '📄 Rent Space Contract',       short: 'Rent Space Contract' },
  { value: 'rentSpaceAddendum',  title: '📎 Rent Space Addendum',       short: 'Rent Space Addendum' },
  { value: 'condoLease',         title: '🏠 Condo Lease',               short: 'Condo Lease' },
  { value: 'lessorPoa',          title: '✍️ Lessor Power of Attorney',  short: 'Lessor Power of Attorney' },
] as const
export type FormType = typeof FORM_TYPES[number]['value']

/** One paragraph of a clause, and a clause (heading + paragraphs) — shared with Ad Contract. */
export const clauseItem = defineArrayMember({
  type:  'object',
  name:  'clauseItem',
  title: 'Paragraph',
  fields: [
    defineField({ name: 'label', title: 'Number', type: 'string', description: 'e.g. 3.1 or (ก). Leave blank for a plain paragraph.' }),
    defineField({
      name: 'level', title: 'Indent', type: 'string', initialValue: 'main',
      options: { list: [
        { title: 'Main — under the clause heading',                value: 'main' },
        { title: 'Sub — (ก)(ข)(ค) nested under the item above',    value: 'sub'  },
        { title: 'Continuation — lines up with the item above',    value: 'cont' },
      ], layout: 'radio' },
    }),
    defineField({ name: 'text', title: 'Text', type: 'text', rows: 3, validation: Rule => Rule.required() }),
  ],
  preview: {
    select: { label: 'label', text: 'text' },
    prepare: ({ label, text }: any) => ({ title: `${label ? label + '  ' : ''}${String(text ?? '').slice(0, 90)}` }),
  },
})

export const contractClause = defineArrayMember({
  type:  'object',
  name:  'contractClause',
  title: 'Clause',
  fields: [
    defineField({ name: 'title', title: 'Heading', type: 'string', description: 'Printed as "ข้อ N <heading>" — N is the clause\'s position.', validation: Rule => Rule.required() }),
    defineField({ name: 'items', title: 'Paragraphs', type: 'array', of: [clauseItem] }),
  ],
  preview: {
    select: { title: 'title', items: 'items' },
    prepare: ({ title, items }: any) => ({ title, subtitle: `${(items ?? []).length} paragraph(s)` }),
  },
})

const frozen = ({ document }: { document?: any }) => !!document?.status && document.status !== 'draft'
/** Field shown only for these form types. */
const only = (...types: FormType[]) => ({ document }: { document?: any }) => !types.includes(document?.formType)

const termRow = defineArrayMember({
  type: 'object', name: 'legalTermRow', title: 'Row',
  fields: [
    defineField({ name: 'label', title: 'Label', type: 'string', validation: Rule => Rule.required() }),
    defineField({ name: 'value', title: 'Value', type: 'text', rows: 2, description: 'Placeholders allowed.', validation: Rule => Rule.required() }),
    defineField({ name: 'emphasis', title: 'Bold', type: 'boolean', initialValue: false }),
  ],
  preview: { select: { title: 'label', subtitle: 'value' } },
})

const signatureBlock = defineArrayMember({
  type: 'object', name: 'legalSignature', title: 'Signature',
  fields: [
    defineField({ name: 'label', title: 'Role', type: 'string', description: 'e.g. ผู้ให้เช่า / Lessor', validation: Rule => Rule.required() }),
    defineField({ name: 'name',  title: 'Name', type: 'string', description: 'Printed in ( ). Placeholders allowed; blank prints a dotted line.' }),
    defineField({ name: 'note',  title: 'Line under the name', type: 'string', description: 'e.g. position or company.' }),
  ],
  preview: { select: { title: 'label', subtitle: 'name' } },
})

const annexBlock = defineArrayMember({
  type: 'object', name: 'legalAnnex', title: 'Annex',
  fields: [
    defineField({ name: 'title',   title: 'Title', type: 'string', validation: Rule => Rule.required() }),
    defineField({ name: 'columns', title: 'Table columns', type: 'array', of: [{ type: 'string' }], description: 'Leave empty for no table.' }),
    defineField({ name: 'rows',    title: 'Blank table rows', type: 'number', initialValue: 15 }),
    defineField({ name: 'lines',   title: 'Lines below the table', type: 'array', of: [{ type: 'string' }] }),
  ],
  preview: { select: { title: 'title' } },
})

/** The wording of one language. Fields not used by the chosen form type are hidden. */
const wording = (lang: 'th' | 'en') => defineField({
  name: lang, title: lang === 'th' ? 'Thai' : 'English', type: 'object', group: lang,
  readOnly: frozen,
  hidden: lang === 'en' ? only('rentSpaceQuotation', 'rentSpaceContract', 'rentSpaceAddendum', 'condoLease', 'lessorPoa') : undefined,
  options: { collapsible: false },
  fields: [
    defineField({ name: 'title',      title: 'Document Title', type: 'string',
      hidden: only('rentSpaceQuotation', 'rentSpaceContract', 'rentSpaceAddendum', 'condoLease', 'lessorPoa'),
      description: 'Rent Space Addendum: the title before signing (เอกสารแนบท้าย…).' }),
    defineField({ name: 'titleAfter', title: 'Title After Signing', type: 'string', hidden: only('rentSpaceAddendum'),
      description: 'e.g. บันทึกข้อตกลงแก้ไขเพิ่มเติม… — used when the addendum is made after the contract is signed.' }),
    defineField({ name: 'to',         title: 'To (addressee line)', type: 'string', hidden: only('rentSpaceQuotation'),
      description: 'e.g. ฝ่ายบริหารโครงการ / Project Management' }),
    defineField({ name: 'placeLine',  title: 'Made-at / Date Line', type: 'string', hidden: only('lessorPoa'),
      description: 'e.g. ทำที่ {poa_place} วันที่ {poa_date}' }),
    defineField({ name: 'stampDuty',  title: 'Stamp Duty Box', type: 'string', hidden: only('lessorPoa'),
      description: 'e.g. ติดอากรแสตมป์ 30 บาท' }),
    defineField({ name: 'intro',      title: 'Opening Paragraph', type: 'text', rows: 5, description: 'Placeholders allowed.' }),
    defineField({ name: 'terms',      title: 'Condition / Details Rows', type: 'array', of: [termRow], hidden: only('rentSpaceQuotation') }),
    defineField({ name: 'clauses',    title: 'Clauses', type: 'array', of: [contractClause],
      hidden: only('adContract', 'rentSpaceContract', 'condoLease', 'lessorPoa') }),
    defineField({ name: 'amendLabel',    title: 'Amendment Heading', type: 'string', hidden: only('rentSpaceAddendum'), description: 'e.g. แก้ไขข้อ' }),
    defineField({ name: 'originalLabel', title: 'Original Text Label', type: 'string', hidden: only('rentSpaceAddendum'), description: 'e.g. ข้อความเดิม:' }),
    defineField({ name: 'amendedLabel',  title: 'Amended Text Label', type: 'string', hidden: only('rentSpaceAddendum'), description: 'e.g. ให้แก้ไขเป็น:' }),
    defineField({ name: 'unchanged',     title: 'Unchanged-Terms Line', type: 'text', rows: 2, hidden: only('rentSpaceAddendum'),
      description: 'The last numbered line — the rest of the contract stays in force.' }),
    defineField({ name: 'closing',    title: 'Closing Line', type: 'text', rows: 2, description: 'Printed above the signatures.' }),
    defineField({ name: 'lessorLabel', title: 'Lessor Signature Label', type: 'string', hidden: only('rentSpaceContract'), description: 'e.g. ผู้ให้เช่า / Lessor' }),
    defineField({ name: 'lesseeLabel', title: 'Lessee Signature Label', type: 'string', hidden: only('rentSpaceContract') }),
    defineField({ name: 'lessorTitle', title: 'Lessor Signatory Title', type: 'string', hidden: only('rentSpaceContract'),
      description: 'e.g. ผู้จัดการนิติบุคคล / Condominium Juristic Manager' }),
    defineField({ name: 'signatures', title: 'Signature Blocks', type: 'array', of: [signatureBlock], hidden: only('condoLease', 'lessorPoa') }),
    defineField({ name: 'docsNote',   title: 'Supporting Documents Line', type: 'text', rows: 2, hidden: only('lessorPoa') }),
    defineField({ name: 'annexes',    title: 'Annexes', type: 'array', of: [annexBlock], hidden: only('condoLease') }),
  ],
})

export default defineType({
  name:  'legalForm',
  title: 'Legal Form',
  type:  'document',
  groups: [
    { name: 'setup', title: 'Setup', default: true },
    { name: 'th',    title: 'Thai' },
    { name: 'en',    title: 'English' },
  ],

  fields: [
    defineField({
      group: 'setup', name: 'formType', title: 'Form Type', type: 'string', readOnly: frozen,
      options: { list: FORM_TYPES.map(t => ({ title: t.title, value: t.value })), layout: 'radio' },
      validation: Rule => Rule.required(),
    }),
    defineField({ group: 'setup', name: 'version', title: 'Version', type: 'number', readOnly: frozen,
      validation: Rule => Rule.required().integer().min(1) }),
    defineField({
      group: 'setup', name: 'status', title: 'Status', type: 'string', initialValue: 'draft',
      options: { list: [
        { title: '📝 Draft — being edited',                       value: 'draft'   },
        { title: '✅ Active — new documents use this wording',     value: 'active'  },
        { title: '🗄 Retired — kept for the record',               value: 'retired' },
      ], layout: 'radio' },
      description: 'Keep exactly one version Active per form type.',
    }),
    defineField({ group: 'setup', name: 'effectiveDate', title: 'Effective From', type: 'date', readOnly: frozen }),
    defineField({ group: 'setup', name: 'changeNote', title: 'What Changed', type: 'text', rows: 2, readOnly: frozen }),
    defineField({ group: 'setup', name: 'lessorMinutes', title: 'Lessor Announcement Minutes / Day', type: 'number', initialValue: 60,
      readOnly: frozen, hidden: only('rentSpaceContract'), description: 'Fills {lessorMinutes} in the Rent Space contract.' }),
    wording('th'),
    wording('en'),
  ],

  orderings: [
    { title: 'Type, then Version — Newest', name: 'typeVer', by: [{ field: 'formType', direction: 'asc' }, { field: 'version', direction: 'desc' }] },
  ],

  preview: {
    select: { formType: 'formType', version: 'version', status: 'status', effectiveDate: 'effectiveDate', changeNote: 'changeNote' },
    prepare: ({ formType, version, status, effectiveDate, changeNote }: any) => ({
      title:    `${status === 'active' ? '✅' : status === 'retired' ? '🗄' : '📝'} ${FORM_TYPES.find(t => t.value === formType)?.short ?? 'Legal Form'} v${version ?? '?'}`,
      subtitle: [effectiveDate, changeNote].filter(Boolean).join(' · '),
    }),
  },
})
