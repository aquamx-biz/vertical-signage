import { defineField, defineType } from 'sanity'

// Global singleton — _id is always "aquamxContact-global".
//
// How a person reaches aquamx, kept in one place because it is quoted in
// several: the LINE bot prints the phone on a confirmed viewing so someone
// already standing in a lobby has something to dial, and anywhere else that
// needs "call us" should read it here rather than hardcode a number that
// then goes stale in six places at once.

export default defineType({
  name: 'aquamxContact',
  title: 'aquamx Contact · ช่องทางติดต่อ aquamx',
  type: 'document',
  fields: [
    defineField({
      name: 'phone', title: 'Phone · เบอร์โทร', type: 'string',
      description: 'เบอร์ที่ลูกค้าโทรหาแอดมินได้ — ขึ้นบนการ์ดยืนยันนัด เผื่อหากันไม่เจอหน้าตึก',
    }),
    defineField({
      name: 'lineId', title: 'LINE ID · ไลน์', type: 'string',
      description: 'เช่น @aquamx',
    }),
    defineField({
      name: 'email', title: 'Email · อีเมล', type: 'string',
    }),
    defineField({
      name: 'hours', title: 'Hours · เวลาทำการ', type: 'string',
      description: 'เช่น "ทุกวัน 09:00-20:00" — ว่างไว้ได้ ถ้าไม่อยากผูกเวลา',
    }),

    // ── Signing — the director's signature and the company seal, drawn into
    // contracts by the LINE bot ("ลงนาม aquamx + ประทับตรา" in aquamx-leasing).
    // One place for every document type that will ever need them.
    defineField({ name: 'signatureImage', title: 'Signing · Director signature (PNG, transparent)', type: 'image',
      description: 'Drawn above the lessee line of a contract the juristic person has signed. Transparent PNG, roughly 4:1.' }),
    defineField({ name: 'companySeal', title: 'Signing · Company seal (PNG, transparent)', type: 'image',
      description: 'Drawn to the right of the printed lessee name, slightly over it.' }),
    defineField({ name: 'signatoryNameTh', title: 'Signing · Signatory name (Thai)', type: 'string', initialValue: 'นายศักดิ์ชัย สุทธิพิพัฒน์' }),
    defineField({ name: 'signatoryNameEn', title: 'Signing · Signatory name (English)', type: 'string', initialValue: 'Mr. Sakchai Suthipipat' }),
    defineField({ name: 'signatoryTitleTh', title: 'Signing · Signatory title (Thai)', type: 'string', initialValue: 'กรรมการผู้มีอำนาจ' }),
    defineField({ name: 'signatoryTitleEn', title: 'Signing · Signatory title (English)', type: 'string', initialValue: 'Authorized Director' }),
    // ── Company papers sent back with a signed contract — certified copies
    // ("รับรองสำเนาถูกต้อง" + signature + seal) scanned once and kept here. The
    // affidavit expires: the bot refuses to attach one past its validity.
    defineField({ name: 'companyAffidavit', title: 'Company papers · Affidavit (หนังสือรับรองบริษัท) — certified copy, PDF', type: 'file', options: { accept: '.pdf' },
      description: 'Every page signed "รับรองสำเนาถูกต้อง" with the seal. Sent to the juristic person together with the counter-signed contract.' }),
    defineField({ name: 'companyAffidavitIssuedAt', title: 'Company papers · Affidavit issue date', type: 'date', description: 'Date printed on the DBD affidavit.' }),
    defineField({ name: 'companyAffidavitValidMonths', title: 'Company papers · Affidavit valid for (months)', type: 'number', initialValue: 6,
      description: 'Counterparties usually accept an affidavit up to 3–6 months old. Past this the bot flags it and asks for a fresh one before sending.' }),
    defineField({ name: 'directorIdCopy', title: 'Company papers · Director ID card — certified copy, PDF', type: 'file', options: { accept: '.pdf' },
      description: 'Signed "รับรองสำเนาถูกต้อง", used only for contracts (สำเนาบัตรประชาชนสำหรับสัญญาเช่า).' }),
    defineField({ name: 'otherCompanyDocuments', title: 'Company papers · Other documents sent with a contract', type: 'array',
      of: [{ type: 'object', fields: [
        { name: 'label', title: 'Label (as shown on the card / e-mail)', type: 'string', validation: (r: any) => r.required() },
        { name: 'file', title: 'PDF', type: 'file', options: { accept: '.pdf' }, validation: (r: any) => r.required() },
      ], preview: { select: { title: 'label' } } }] }),
    defineField({ name: 'signatureAnchors', title: 'Signing · Text that marks the lessee line', type: 'array', of: [{ type: 'string' }],
      description: 'The bot looks for these in the PDF to find where to sign (spaces ignored). Defaults to the two signatory names above — change only if the contract template prints something else.' }),
  ],
  preview: {
    select: { title: 'phone', subtitle: 'lineId' },
    prepare: ({ title, subtitle }) => ({
      title: title || 'ยังไม่ได้ใส่เบอร์',
      subtitle: subtitle || '',
    }),
  },
})
