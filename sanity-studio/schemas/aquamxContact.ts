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
  // One document for everything that is "us": how to reach us, who we are on
  // paper, the commercial defaults every quotation / invoice / receipt starts
  // from, and the signing kit. Code reads this instead of carrying its own
  // copy — a party's own value (e.g. its credit term) wins over the default.
  groups: [
    { name: 'contact',    title: '1. Contact' },
    { name: 'company',    title: '2. Company' },
    { name: 'commercial', title: '3. Commercial defaults' },
    { name: 'signing',    title: '4. Signing' },
    { name: 'papers',     title: '5. Company papers' },
  ],
  fields: [
    // ── 2. Company — who we are on documents ───────────────────────────────
    defineField({ group: 'company', name: 'companyNameTh', title: 'Company name (Thai)', type: 'string', initialValue: 'บริษัท อควาแม็กซ์ พรอพเพอร์ตี้ จำกัด' }),
    defineField({ group: 'company', name: 'companyNameEn', title: 'Company name (English)', type: 'string', initialValue: 'Aquamax Property Co., Ltd.' }),
    defineField({ group: 'company', name: 'taxId', title: 'Tax ID', type: 'string', initialValue: '0105556032458' }),
    defineField({ group: 'company', name: 'addressTh', title: 'Registered address (Thai)', type: 'text', rows: 2 }),
    defineField({ group: 'company', name: 'addressEn', title: 'Registered address (English)', type: 'text', rows: 2 }),
    defineField({ group: 'company', name: 'docPhone', title: 'Phone printed on documents', type: 'string',
      description: 'Footer of quotations, invoices, receipts. The Contact phone above is for customers to call the admin; this one is the company number.' }),
    defineField({ group: 'company', name: 'docEmail', title: 'E-mail printed on documents', type: 'string' }),
    defineField({ group: 'company', name: 'receivingAccount', title: 'Receiving bank account (default)', type: 'reference', to: [{ type: 'bankAccount' }],
      description: 'Printed on invoices and the payment card. Falls back to the bankAccount marked "default receiving".' }),

    // ── 3. Commercial defaults — the terms a new document starts from ──────
    defineField({ group: 'commercial', name: 'creditTermDays', title: 'Credit term (days)', type: 'number', initialValue: 7,
      description: 'Invoice due date = invoice date + this, unless the party has its own paymentTermsDays.' }),
    defineField({ group: 'commercial', name: 'quotationValidDays', title: 'Quotation valid for (days)', type: 'number', initialValue: 30 }),
    defineField({ group: 'commercial', name: 'whtRatePct', title: 'Withholding tax on advertising (%)', type: 'number', initialValue: 2,
      description: 'Shown on invoices/receipts as the amount a juristic payer may deduct.' }),
    defineField({ group: 'commercial', name: 'renewalNoticeDays', title: 'Renewal notice before a package ends (days)', type: 'number', initialValue: 14,
      description: 'The ↻ renew button appears on the shop\'s package card, and the deal enters the renewal queue, this many days before expiry.' }),
    defineField({ group: 'commercial', name: 'overdueReminderDays', title: 'Reminder after an invoice is overdue (days)', type: 'number', initialValue: 3,
      description: 'The daily sweep posts an overdue card to aquamx-shop this many days past the due date, then every 7 days.' }),

    // ── 1. Contact ─────────────────────────────────────────────────────────
    defineField({
      group: 'contact',
      name: 'phone', title: 'Phone · เบอร์โทร', type: 'string',
      description: 'เบอร์ที่ลูกค้าโทรหาแอดมินได้ — ขึ้นบนการ์ดยืนยันนัด เผื่อหากันไม่เจอหน้าตึก',
    }),
    defineField({
      group: 'contact',
      name: 'lineId', title: 'LINE ID · ไลน์', type: 'string',
      description: 'เช่น @aquamx',
    }),
    defineField({
      group: 'contact',
      name: 'email', title: 'Email · อีเมล', type: 'string',
    }),
    defineField({
      group: 'contact',
      name: 'hours', title: 'Hours · เวลาทำการ', type: 'string',
      description: 'เช่น "ทุกวัน 09:00-20:00" — ว่างไว้ได้ ถ้าไม่อยากผูกเวลา',
    }),

    // ── Signing — the director's signature and the company seal, drawn into
    // contracts by the LINE bot ("ลงนาม aquamx + ประทับตรา" in aquamx-leasing).
    // One place for every document type that will ever need them.
    defineField({ group: 'signing', name: 'signatureImage', title: 'Signing · Director signature (PNG, transparent)', type: 'image',
      description: 'Drawn above the lessee line of a contract the juristic person has signed. Transparent PNG, roughly 4:1.' }),
    defineField({ group: 'signing', name: 'companySeal', title: 'Signing · Company seal (PNG, transparent)', type: 'image',
      description: 'Drawn to the right of the printed lessee name, slightly over it.' }),
    defineField({ group: 'signing', name: 'signatoryNameTh', title: 'Signing · Signatory name (Thai)', type: 'string', initialValue: 'นายศักดิ์ชัย สุทธิพิพัฒน์' }),
    defineField({ group: 'signing', name: 'signatoryNameEn', title: 'Signing · Signatory name (English)', type: 'string', initialValue: 'Mr. Sakchai Suthipipat' }),
    defineField({ group: 'signing', name: 'signatoryTitleTh', title: 'Signing · Signatory title (Thai)', type: 'string', initialValue: 'กรรมการผู้มีอำนาจ' }),
    defineField({ group: 'signing', name: 'signatoryTitleEn', title: 'Signing · Signatory title (English)', type: 'string', initialValue: 'Authorized Director' }),
    // ── Company papers sent back with a signed contract — certified copies
    // ("รับรองสำเนาถูกต้อง" + signature + seal) scanned once and kept here. The
    // affidavit expires: the bot refuses to attach one past its validity.
    defineField({ group: 'papers', name: 'companyAffidavit', title: 'Company papers · Affidavit (หนังสือรับรองบริษัท) — as issued by DBD, PDF', type: 'file', options: { accept: '.pdf' },
      description: 'Upload the DBD e-certificate as downloaded. The bot certifies it per contract when sending ("รับรองสำเนาถูกต้อง" + signature + seal + a line naming the contract) — nothing to sign by hand.' }),
    defineField({ group: 'papers', name: 'companyAffidavitIssuedAt', title: 'Company papers · Affidavit issue date', type: 'date', description: 'Date printed on the DBD affidavit.' }),
    defineField({ group: 'papers', name: 'companyAffidavitPreCertified', title: 'Company papers · Affidavit is already a certified copy — attach as is', type: 'boolean', initialValue: false,
      description: 'Tick when the file already carries "รับรองสำเนาถูกต้อง" + signature + seal (e.g. a scanned certified copy). The bot then sends it unchanged instead of stamping it again.' }),
    defineField({ group: 'papers', name: 'companyAffidavitValidMonths', title: 'Company papers · Affidavit valid for (months)', type: 'number', initialValue: 6,
      description: 'Counterparties usually accept an affidavit up to 3–6 months old. Past this the bot flags it and asks for a fresh one before sending.' }),
    defineField({ group: 'papers', name: 'directorIdCopy', title: 'Company papers · Director ID card copy — plain scan, PDF', type: 'file', options: { accept: '.pdf' },
      description: 'A clean scan of the card, no watermark. The bot certifies it per contract when sending (signature, seal, purpose line naming the contract).' }),
    defineField({ group: 'papers', name: 'directorIdCopyPreCertified', title: 'Company papers · ID copy is already certified — attach as is', type: 'boolean', initialValue: false }),
    defineField({ group: 'papers', name: 'otherCompanyDocuments', title: 'Company papers · Other documents sent with a contract', type: 'array',
      of: [{ type: 'object', fields: [
        { name: 'label', title: 'Label (as shown on the card / e-mail)', type: 'string', validation: (r: any) => r.required() },
        { name: 'file', title: 'PDF', type: 'file', options: { accept: '.pdf' }, validation: (r: any) => r.required() },
      ], preview: { select: { title: 'label' } } }] }),
    defineField({ group: 'signing', name: 'signatureAnchors', title: 'Signing · Text that marks the lessee line', type: 'array', of: [{ type: 'string' }],
      description: 'The bot looks for these in the PDF to find where to sign (spaces ignored). Defaults to the two signatory names above — change only if the contract template prints something else.' }),
  ],
  preview: {
    select: { title: 'companyNameTh', subtitle: 'docPhone' },
    prepare: ({ title, subtitle }) => ({
      title: title || 'aquamx — company & contact',
      subtitle: subtitle || '',
    }),
  },
})
