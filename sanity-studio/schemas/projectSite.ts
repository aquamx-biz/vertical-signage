import { defineField, defineType }       from 'sanity'
import { ApprovalLockedBanner }          from '../components/ApprovalLockedBanner'
import { ProjectNameTranslateInput }     from '../components/ProjectNameTranslateInput'
import { AILookupInput }                 from '../components/AILookupInput'
import { AILookupNumberInput }           from '../components/AILookupNumberInput'
import type { StringInputProps }         from 'sanity'
import type { NumberInputProps }         from 'sanity'

// Per-field wrappers so fieldKey is baked in without runtime prop passing
const AddressInput      = (p: StringInputProps) => AILookupInput({ ...p, fieldKey: 'address',         multiline: true, rows: 2 })
const BtsInput          = (p: StringInputProps) => AILookupInput({ ...p, fieldKey: 'btsStation' })
const AreaInput         = (p: StringInputProps) => AILookupInput({ ...p, fieldKey: 'area' })
const DeveloperInput    = (p: StringInputProps) => AILookupInput({ ...p, fieldKey: 'developer' })
const CommonFeesInput   = (p: StringInputProps) => AILookupInput({ ...p, fieldKey: 'commonFees' })
const TelephoneInput    = (p: StringInputProps) => AILookupInput({ ...p, fieldKey: 'telephone' })
const CompletionYrInput = (p: NumberInputProps) => AILookupNumberInput({ ...p, fieldKey: 'completionYear' })
const ParkingInput      = (p: NumberInputProps) => AILookupNumberInput({ ...p, fieldKey: 'numberOfParking' })
const TotalUnitsInput   = (p: NumberInputProps) => AILookupNumberInput({ ...p, fieldKey: 'totalUnits' })
const GoogleMapInput    = (p: StringInputProps) => AILookupInput({ ...p, fieldKey: 'googleMapUrl' })

/**
 * Project Site — master record for a condo/property project.
 * Referenced by Contract documents.
 */
export default defineType({
  name: 'projectSite',
  title: 'Project Site',
  type: 'document',

  fields: [

    // ── Approval locked banner ────────────────────────────────────────────────
    defineField({
      name:       'approvalLockedBanner',
      title:      'Approval Lock',
      type:       'string',
      readOnly:   true,
      components: { input: ApprovalLockedBanner },
    }),

    defineField({
      name:  'projectEn',
      title: 'Project Name (EN)',
      type:  'string',
      readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved',
      validation: Rule => Rule.required().custom(async (value, context) => {
        if (!value) return true
        const client   = (context as any).getClient({ apiVersion: '2024-01-01' })
        const docId    = (context.document as any)?._id ?? ''
        const existing = await client.fetch(
          `count(*[_type == "projectSite" && projectEn == $name && !(_id in [$id, "drafts." + $id])])`,
          { name: value, id: docId.replace(/^drafts\./, '') },
        )
        return existing === 0 ? true : `"${value}" already exists as a Project Site.`
      }),
    }),
    defineField({ name: 'projectTh', title: 'Project Name (TH)', type: 'string', readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved', components: { input: ProjectNameTranslateInput } }),
    defineField({ name: 'address',    title: 'Address',          type: 'text',   rows: 2, readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved', components: { input: AddressInput } }),
    defineField({ name: 'btsStation', title: 'BTS / MRT Station', type: 'string', components: { input: BtsInput } }),

    // Building photo — the face of this project wherever it is offered outside
    // the lobby: the LINE "หาห้อง" carousel today, the web board next. A card
    // with a photo is picked over a card without one; text-only cards read as
    // a list, not a place. One good exterior/lobby shot is enough.
    defineField({
      name: 'heroImage',
      title: 'รูปตึก (การ์ดใน LINE / เว็บ)',
      type: 'image',
      options: { hotspot: true },
      description: 'รูปด้านนอกหรือล็อบบี้ที่ดูออกว่าเป็นตึกไหน — แนวนอน กว้าง ≥1200px · ใช้เป็นรูปหน้าปกของโครงการนี้ทุกที่นอกจอ',
    }),
    defineField({ name: 'area',       title: 'Area',              type: 'string', components: { input: AreaInput } }),
    defineField({
      name: 'aliases', title: 'Aliases · ชื่อเรียกอื่น', type: 'array', of: [{ type: 'string' }],
      description: 'ทุกสะกดที่โลกใช้เรียกตึกนี้ — ชื่อบนบอร์ด, ชื่อจาก portal ทั้ง 6 เจ้า, '
        + 'ชื่อที่เจ้าของพิมพ์เข้ามาเอง, คำที่สะกดผิดบ่อย · ระบบใช้จับคู่ชื่อที่พิมพ์เข้ามากับตึกนี้ '
        + '(เทียบแบบไม่สนตัวพิมพ์ วรรค หรือคำว่า The/เดอะ อยู่แล้ว — ใส่เฉพาะที่ต่างกันจริง)',
    }),
    defineField({
      name: 'commonName', title: 'Common Name · ชื่อที่คนเรียกจริง', type: 'string',
      description: 'ชื่อสั้นที่ลูกบ้านและตลาดใช้ เช่น "Park 24" ขณะที่ชื่อเต็มคือ '
        + '"Park Origin Phrom Phong: Park 24 (Phase 1)" — ใช้แสดงผลและใช้จับคู่',
    }),
    defineField({
      name: 'partOf', title: 'Part of · เป็นเฟส/อาคารของ', type: 'reference',
      to: [{ type: 'projectSite' }],
      description: 'ตึกเดียวกันแต่แยกนิติ/แยกเฟสตอนขออนุมัติ — ชี้มาที่ใบหลัก '
        + 'ระบบจะถือว่าเป็นตึกเดียวกันเวลาคนพิมพ์ชื่อ แต่สายขออนุมัติยังแยกกันตามจริง',
    }),
    defineField({ name: 'googleMapUrl', title: 'Google Map URL', type: 'url', components: { input: GoogleMapInput } }),
    defineField({ name: 'totalUnits',        title: 'Total Units',    type: 'number', components: { input: TotalUnitsInput } }),
    defineField({ name: 'numberOfBuildings', title: 'No. of Buildings', type: 'number' }),
    defineField({
      name: 'buildings', title: 'ชื่ออาคาร · Building names', type: 'array', of: [{ type: 'string' }],
      description: 'โครงการที่มีหลายอาคาร ใส่ชื่อที่ลูกบ้านใช้เรียกจริง เช่น A / B / Tower 1 · '
        + 'ระบบจะถามเจ้าของห้องว่าอยู่อาคารไหน เฉพาะโครงการที่กรอกช่องนี้ไว้มากกว่า 1 ชื่อ '
        + '(ปล่อยว่าง = ไม่ถาม)',
    }),
    defineField({ name: 'numberOfParking',   title: 'No. of Parking', type: 'number', components: { input: ParkingInput } }),
    defineField({ name: 'commonFees',        title: 'Common Fees',    type: 'string', description: 'e.g. "50 baht/sqm/month"', components: { input: CommonFeesInput } }),
    defineField({ name: 'totalProjectArea',          title: 'Total Project Area',          type: 'string', description: 'e.g. "2,400 sqm"' }),
    defineField({ name: 'developer',      title: 'Developer',       type: 'string', components: { input: DeveloperInput } }),
    defineField({ name: 'completionYear', title: 'Completion Year', type: 'number', components: { input: CompletionYrInput } }),
    defineField({ name: 'percentSold',               title: '% Sold',                      type: 'number' }),
    defineField({ name: 'ownerOccupiedRented',       title: 'Owner Occupied & Rented',     type: 'string' }),
    defineField({ name: 'competitionAtSite',         title: 'Competition at Site',         type: 'text',   rows: 2 }),
    defineField({ name: 'contactPerson',             title: 'Contact Person',              type: 'string' }),
    defineField({ name: 'telephone', title: 'Telephone', type: 'string', components: { input: TelephoneInput } }),
    defineField({ name: 'propertyManagementCompany', title: 'Property Management Company', type: 'string' }),
    defineField({ name: 'emailAddress',              title: 'Email Address',               type: 'string' }),
    defineField({
      name:        'landlord',
      title:       'Landlord / Property Owner (Party)',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'Link to a Party record for this landlord. Create the party first under CRM → Parties.',
    }),
    defineField({
      name:        'pipelineStage',
      title:       'Pipeline Stage',
      type:        'string',
      description: 'Controlled by the approval workflow. Read-only — use the action buttons to change.',
      readOnly:    true,
      options:  { list: [
        { title: '📝 Site Created',        value: 'site_created'        },
        { title: '🔵 Site Review',         value: 'site_review'         },
        { title: '🔴 Site Rejected',       value: 'site_rejected'       },
        { title: '✅ Site Approved',        value: 'approved'            },
        { title: '⏳ Quotation Pending',    value: 'quotation_pending'   },
        { title: '🟢 Quotation Approved',  value: 'quotation_approved'  },
        { title: '⏳ Contract Pending',    value: 'contract_pending'    },
        { title: '🟠 Contract Approved',   value: 'contract_approved'   },
        { title: '✅ Active',              value: 'active'              },
        { title: '🔴 Terminated',          value: 'terminated'          },
      ]},
      initialValue: 'site_created',
    }),
    defineField({ name: 'approvalStatus',       title: 'Approval Status',        type: 'string',   hidden: true }),
    defineField({ name: 'approvalResetReason',  title: 'Reset Reason',           type: 'string',   hidden: true }),
    defineField({ name: 'approvedAt',           title: 'Approved At',            type: 'datetime', hidden: true }),
    defineField({ name: 'lastApprovalSnapshot', title: 'Last Approval Snapshot', type: 'string',   hidden: true, readOnly: true }),
    defineField({ name: 'notificationEmail',    title: 'Notification Email',     type: 'string',   hidden: true }),
  ],

  preview: {
    select: { title: 'projectEn', stage: 'pipelineStage', approvalStatus: 'approvalStatus' },
    prepare({ title, stage, approvalStatus }) {
      const labels: Record<string, string> = {
        site_created:        '📝 Site Created',
        site_review:         '🔵 Site Review',
        site_rejected:       '🔴 Site Rejected',
        approved:            '✅ Site Approved',
        quotation_pending:   '⏳ Quotation Pending',
        quotation_approved:  '🟢 Quotation Approved',
        contract_pending:    '⏳ Contract Pending',
        contract_approved:   '🟠 Contract Approved',
        active:              '✅ Active',
        terminated:          '🔴 Terminated',
      }
      // Backfill: old records approved before pipelineStage tracking was added
      const effectiveStage = (stage === 'site_created' && approvalStatus === 'approved')
        ? 'approved'
        : stage
      return {
        title:    title ?? '(Untitled)',
        subtitle: labels[effectiveStage] ?? '📝 Site Created',
      }
    },
  },
})
