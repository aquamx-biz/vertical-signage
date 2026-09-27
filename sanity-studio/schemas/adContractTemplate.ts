import { defineField, defineType, defineArrayMember } from 'sanity'

/**
 * Ad Contract Template — the wording of สัญญารับโฆษณา, versioned.
 *
 * One document per version (v1, v2 …). Only a DRAFT version can be edited;
 * once a version is Active (or Retired) its wording is frozen. To change the
 * wording: Duplicate the active version, bump the version number, edit, set it
 * Active and set the old one Retired.
 *
 * A contract COPIES the wording of the active version when it is created
 * (clauses / intro / closing on adContract) and records which version it came
 * from. Changing a template never changes a contract that already exists.
 *
 * Placeholders are filled in when the contract is printed:
 *   {providerName} {providerTaxId} {providerAddress}
 *   {advertiserName} {advertiserTaxId} {advertiserAddress}
 *   {package} {siteCount} {screenCount} {quoteNumber}
 *   {months} {startDate} {endDate} {monthlyFee} {totalFee} {totalFeeText}
 *   {paymentDays} {fileLeadDays} {changesPerMonth} {outageDays} {noticeDays} {cureDays}
 */

const frozen = ({ document }: { document?: any }) => !!document?.status && document.status !== 'draft'

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

export default defineType({
  name:  'adContractTemplate',
  title: 'Ad Contract Template',
  type:  'document',

  fields: [
    defineField({ name: 'version', title: 'Version', type: 'number', validation: Rule => Rule.required().integer().min(1), readOnly: frozen }),
    defineField({
      name: 'status', title: 'Status', type: 'string', initialValue: 'draft',
      options: { list: [
        { title: '📝 Draft — being edited',                     value: 'draft'   },
        { title: '✅ Active — new contracts copy this wording',  value: 'active'  },
        { title: '🗄 Retired — kept for the record',             value: 'retired' },
      ], layout: 'radio' },
      description: 'Keep exactly one version Active.',
    }),
    defineField({ name: 'effectiveDate', title: 'Effective From', type: 'date', readOnly: frozen }),
    defineField({ name: 'changeNote', title: 'What Changed', type: 'text', rows: 2, description: 'e.g. "Clause 6.1 — no refund when cancelled before the campaign starts".', readOnly: frozen }),
    defineField({ name: 'intro',   title: 'Opening Paragraph', type: 'text', rows: 5, readOnly: frozen, description: 'The "สัญญานี้ทำขึ้นระหว่าง …" paragraph. Placeholders allowed.' }),
    defineField({ name: 'clauses', title: 'Clauses',           type: 'array', of: [contractClause], readOnly: frozen }),
    defineField({ name: 'closing', title: 'Closing Line',      type: 'text', rows: 2, readOnly: frozen, description: 'Printed above the signatures.' }),
  ],

  orderings: [{ title: 'Version — Newest', name: 'verDesc', by: [{ field: 'version', direction: 'desc' }] }],

  preview: {
    select: { version: 'version', status: 'status', effectiveDate: 'effectiveDate', changeNote: 'changeNote' },
    prepare: ({ version, status, effectiveDate, changeNote }: any) => ({
      title:    `${status === 'active' ? '✅' : status === 'retired' ? '🗄' : '📝'} Ad Contract Template v${version ?? '?'}`,
      subtitle: [effectiveDate, changeNote].filter(Boolean).join(' · '),
    }),
  },
})
