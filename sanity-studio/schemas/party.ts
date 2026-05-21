import { defineField, defineType, defineArrayMember } from 'sanity'
import { createTranslateInput }  from '../components/TranslateInput'
import { AddressAIInput }        from '../components/AddressAIInput'
import { JuristicNameTHInput }   from '../components/JuristicNameInput'
import { createCopyFromSiteInput } from '../components/CopyFromSiteInput'

const PhoneFromSiteInput   = createCopyFromSiteInput('telephone')
const EmailFromSiteInput   = createCopyFromSiteInput('emailAddress')
const ManagerFromSiteInput = createCopyFromSiteInput('contactPerson')

/**
 * Party — unified contact/entity record used across all workflows.
 *
 * One document per real-world entity. A party can hold multiple roles
 * (e.g. a property owner who also buys ad space holds both propertyOwner + advertiser).
 *
 * Role-specific tabs are shown/hidden based on partyRole selection.
 */
export default defineType({
  name:  'party',
  title: 'Party',
  type:  'document',

  groups: [
    { name: 'identity',      title: 'Identity & Contact', default: true },
    { name: 'financial',     title: '💰 Financial & Billing' },
    { name: 'propertyOwner', title: '🏠 Property Owner'   },
    { name: 'advertiser',     title: '📢 Advertiser'       },
    { name: 'agent',          title: '🤝 Agent / Broker'   },
    { name: 'developer',      title: '🏗️ Developer'        },
    { name: 'tenant',         title: '🏡 Tenant / Buyer'   },
    { name: 'vendor',         title: '📦 Vendor'           },
    { name: 'serviceProvider', title: '🔧 Service Provider' },
    { name: 'appVendor',      title: '💻 App Vendor'       },
  ],

  fields: [

    // ── Identity & Contact ────────────────────────────────────────────────────

    defineField({
      group:       'identity',
      name:        'partyRole',
      title:       'Roles',
      type:        'array',
      description: 'A party can hold multiple roles. Role-specific tabs will appear below.',
      of:          [defineArrayMember({ type: 'string' })],
      options: {
        list: [
          { title: '🏛️ Juristic Person',    value: 'juristicPerson'  },
          { title: '🏠 Property Owner',     value: 'propertyOwner'   },
          { title: '📢 Advertiser',         value: 'advertiser'      },
          { title: '🤝 Agent / Broker',     value: 'agent'           },
          { title: '🏗️ Developer',          value: 'developer'       },
          { title: '🏡 Tenant / Buyer',     value: 'tenant'          },
          { title: '📦 Vendor / Supplier',  value: 'vendor'          },
          { title: '🔧 Service Provider',   value: 'serviceProvider' },
          { title: '💻 App Vendor',         value: 'appVendor'       },
        ],
      },
      validation: Rule => Rule.required().min(1),
    }),

    defineField({
      group:       'identity',
      name:        'projectSites',
      title:       'Associated Project Sites',
      type:        'array',
      of:          [defineArrayMember({ type: 'reference', to: [{ type: 'projectSite' }] })],
      description: 'Project sites this party is associated with. A juristic person may manage multiple buildings; a developer may have many projects.',
      hidden:      ({ document }: any) => {
        const roles = (document?.partyRole ?? []) as string[]
        return !roles.includes('juristicPerson') && !roles.includes('propertyOwner')
      },
    }),
    // Legacy single-ref — hidden, kept so existing saved data is not lost
    defineField({ group: 'identity', name: 'projectSite', title: 'Associated Project Site (legacy)', type: 'reference', to: [{ type: 'projectSite' }], hidden: true }),

    defineField({
      group:       'identity',
      name:        'identityType',
      title:       'Identity Type',
      type:        'string',
      options: {
        list: [
          { title: '🏛️ Corporate / Juristic',  value: 'corporate'  },
          { title: '👤 Individual / Personal', value: 'individual' },
        ],
        layout: 'radio',
      },
      initialValue: 'corporate',
      validation:  Rule => Rule.required(),
    }),

    // Corporate fields
    defineField({
      group:       'identity',
      name:        'legalName_th',
      title:       'Legal Name (Thai)',
      type:        'string',
      description: 'Full registered legal name in Thai.',
      hidden:      ({ document }: any) => document?.identityType !== 'corporate',
      validation:  Rule => Rule.custom((val, ctx: any) => {
        if (ctx.document?.identityType === 'corporate' && !val) return 'Required for corporate entities.'
        return true
      }),
      components:  { input: JuristicNameTHInput },
    }),
    defineField({
      group:       'identity',
      name:        'legalName_en',
      title:       'Legal Name (English)',
      type:        'string',
      description: 'Full registered legal name in English.',
      hidden:      ({ document }: any) => document?.identityType !== 'corporate',
      components:  { input: createTranslateInput({ sourceField: 'legalName_th', sourceLang: 'Thai', targetLang: 'English' }) },
    }),
    // Legacy — kept hidden so old records (stored as `legalName`) still resolve correctly
    defineField({ group: 'identity', name: 'legalName', title: 'Legal Name (legacy)', type: 'string', hidden: true }),

    defineField({
      group:  'identity',
      name:   'taxId',
      title:  'Tax ID / เลขผู้เสียภาษี',
      type:   'string',
      hidden: ({ document }: any) => document?.identityType !== 'corporate',
    }),

    defineField({
      group:  'identity',
      name:   'registrationNo',
      title:  'Company Registration Number',
      type:   'string',
      hidden: ({ document }: any) => document?.identityType !== 'corporate',
    }),

    defineField({
      group:       'identity',
      name:        'juristicManager',
      title:       'Contact Person / Manager in-charge',
      type:        'string',
      description: 'Name of the authorised signatory or main contact person.',
      hidden:      ({ document }: any) => document?.identityType !== 'corporate',
      components:  { input: ManagerFromSiteInput },
    }),

    // Profile picture / logo — applies to both individuals and juristics.
    // Reconstructed 2026-05-21 from production data (11 party docs already carry
    // it). The string `profilePicture` has never appeared in this repo's git
    // history — earlier edit was deployed but never committed. Same loss pattern
    // as billingPeriods (rentSpace) and the Mini-GL fields (procurement).
    defineField({
      group:       'identity',
      name:        'profilePicture',
      title:       'Profile Picture / Logo',
      type:        'image',
      options:     { hotspot: true },
      description: 'Optional photo or logo. Helps disambiguate the party in CRM list views.',
    }),

    // Individual fields
    defineField({
      group:       'identity',
      name:        'firstName',
      title:       'First Name',
      type:        'string',
      hidden:      ({ document }: any) => document?.identityType !== 'individual',
      validation:  Rule => Rule.custom((val, ctx: any) => {
        if (ctx.document?.identityType === 'individual' && !val) return 'Required for individuals.'
        return true
      }),
    }),

    defineField({
      group:  'identity',
      name:   'lastName',
      title:  'Last Name',
      type:   'string',
      hidden: ({ document }: any) => document?.identityType !== 'individual',
    }),

    defineField({
      group:  'identity',
      name:   'nationalId',
      title:  'National ID / เลขบัตรประชาชน',
      type:   'string',
      hidden: ({ document }: any) => document?.identityType !== 'individual',
    }),

    defineField({
      group:  'identity',
      name:   'dateOfBirth',
      title:  'Date of Birth',
      type:   'date',
      hidden: ({ document }: any) => document?.identityType !== 'individual',
    }),

    // Contact — simple fields with "Copy from Project Site" button
    defineField({
      group:      'identity',
      name:       'phone',
      title:      'Phone',
      type:       'string',
      components: { input: PhoneFromSiteInput },
    }),

    defineField({
      group:      'identity',
      name:       'email',
      title:      'Email',
      type:       'string',
      validation: Rule => Rule.email(),
      components: { input: EmailFromSiteInput },
    }),

    defineField({ group: 'identity', name: 'lineId',      title: 'LINE ID',       type: 'string' }),
    defineField({ group: 'identity', name: 'lineUserId',  title: 'LINE User ID',   type: 'string',
      description: 'Individual LINE User ID. DM the LINE OA — the bot will reply with this ID.',
    }),
    defineField({ group: 'identity', name: 'lineGroupId', title: 'LINE Group ID',  type: 'string',
      description: 'Group conversation ID from LINE. Add the bot to the group and send any message — the bot will reply with this ID.',
    }),
    defineField({ group: 'identity', name: 'website', title: 'Website', type: 'url'    }),

    // Legacy array fields — hidden, kept so existing data is not lost
    defineField({ group: 'identity', name: 'phones', title: 'Phone Numbers (legacy)', type: 'array', hidden: true,
      of: [defineArrayMember({ type: 'object', fields: [
        defineField({ name: 'label', title: 'Label', type: 'string' }),
        defineField({ name: 'number', title: 'Number', type: 'string' }),
      ]})],
    }),
    defineField({ group: 'identity', name: 'emails', title: 'Email Addresses (legacy)', type: 'array', hidden: true,
      of: [defineArrayMember({ type: 'object', fields: [
        defineField({ name: 'label', title: 'Label', type: 'string' }),
        defineField({ name: 'email', title: 'Email', type: 'string' }),
      ]})],
    }),

    defineField({
      group:       'identity',
      name:        'addressFull',
      title:       'Address',
      type:        'text',
      rows:        3,
      description: 'Full address. Use ✨ buttons to find or format via AI.',
      components:  { input: AddressAIInput },
    }),

    defineField({
      group: 'identity',
      name:  'tags',
      title: 'Tags',
      type:  'array',
      of:    [defineArrayMember({ type: 'string' })],
      options: { layout: 'tags' },
    }),

    defineField({
      group: 'identity',
      name:  'internalNotes',
      title: 'Internal Notes',
      type:  'text',
      rows:  3,
    }),

    // ── Financial & Billing ───────────────────────────────────────────────────

    defineField({
      group:        'financial',
      name:         'vatRegistered',
      title:        'VAT Registered',
      type:         'boolean',
      initialValue: false,
      description:  'Is this party registered for VAT (มูลค่าเพิ่ม)?',
    }),

    defineField({
      group:       'financial',
      name:        'vatNumber',
      title:       'VAT Registration Number',
      type:        'string',
      description: 'May be the same as Tax ID for most juristic persons. Include branch code if applicable (e.g. 0105559XXXXXXX 00001).',
      hidden:      ({ document }: any) => !document?.vatRegistered,
    }),

    defineField({
      group:       'financial',
      name:        'billingAddress',
      title:       'Billing Address',
      type:        'text',
      rows:        3,
      description: 'Leave blank if same as registered address.',
    }),

    defineField({
      group:       'financial',
      name:        'paymentTermsDays',
      title:       'Payment Terms (days)',
      type:        'number',
      description: 'e.g. 30 = net 30 days.',
    }),

    defineField({
      group:       'financial',
      name:        'creditLimit',
      title:       'Credit Limit (THB)',
      type:        'number',
    }),

    defineField({
      group:   'financial',
      name:    'bankAccount',
      title:   'Bank Account',
      type:    'object',
      options: { collapsible: false },
      fields: [
        defineField({
          name:    'bankName',
          title:   'Bank Name',
          type:    'string',
          options: { list: [
            { title: 'กสิกรไทย (KBank)',             value: 'kbank'     },
            { title: 'ไทยพาณิชย์ (SCB)',              value: 'scb'       },
            { title: 'กรุงเทพ (BBL)',                 value: 'bbl'       },
            { title: 'กรุงไทย (KTB)',                 value: 'ktb'       },
            { title: 'กรุงศรีอยุธยา (BAY)',           value: 'bay'       },
            { title: 'ทหารไทยธนชาต (TTB)',            value: 'ttb'       },
            { title: 'ซีไอเอ็มบีไทย (CIMB)',         value: 'cimb'      },
            { title: 'ยูโอบี (UOB)',                  value: 'uob'       },
            { title: 'แลนด์ แอนด์ เฮ้าส์ (LH Bank)', value: 'lhbank'    },
            { title: 'ออมสิน (GSB)',                  value: 'gsb'       },
            { title: 'ธ.ก.ส. (BAAC)',                 value: 'baac'      },
            { title: 'อื่นๆ (Other)',                 value: 'other'     },
          ]},
        }),
        defineField({ name: 'accountName',   title: 'Account Name',                    type: 'string' }),
        defineField({ name: 'accountNumber', title: 'Account Number',                  type: 'string' }),
        defineField({ name: 'branch',        title: 'Branch / สาขา',                   type: 'string' }),
        defineField({
          name:    'accountType',
          title:   'Account Type',
          type:    'string',
          options: { list: [
            { title: 'ออมทรัพย์ (Savings)',  value: 'savings'  },
            { title: 'กระแสรายวัน (Current)', value: 'current'  },
            { title: 'ฝากประจำ (Fixed)',      value: 'fixed'    },
          ], layout: 'radio' },
          initialValue: 'savings',
        }),
        defineField({
          name:        'promptPayId',
          title:       'PromptPay ID',
          type:        'string',
          description: 'Mobile number or Tax ID registered with PromptPay.',
        }),
        defineField({
          name:        'evidence',
          title:       'Bank Account Evidence',
          type:        'image',
          description: 'Photo of bank book cover or account confirmation document.',
          options:     { hotspot: false },
        }),
      ],
    }),

    defineField({
      group:       'financial',
      name:        'financialNotes',
      title:       'Financial Notes',
      type:        'text',
      rows:        3,
      description: 'Internal notes on billing, payment history, special terms, etc.',
    }),

    // ── Property Owner ────────────────────────────────────────────────────────

    defineField({
      group:   'propertyOwner',
      name:    'propertyOwnerInfo',
      title:   'Property Owner Details',
      type:    'object',
      hidden:  ({ document }: any) => !((document?.partyRole ?? []) as string[]).includes('propertyOwner'),
      options: { collapsible: false },
      fields: [
        defineField({ name: 'numberOfUnitsOwned',  title: 'Number of Units Owned',  type: 'number' }),
        defineField({
          name:    'preferredListingType',
          title:   'Preferred Listing Type',
          type:    'string',
          options: { list: [
            { title: 'For Rent',      value: 'rent' },
            { title: 'For Sale',      value: 'sale' },
            { title: 'Rent & Sale',   value: 'both' },
          ]},
        }),
        defineField({ name: 'expectedRentalPrice', title: 'Expected Rental Price (THB/mo)', type: 'string' }),
        defineField({ name: 'expectedSalePrice',   title: 'Expected Sale Price (THB)',       type: 'string' }),
        defineField({ name: 'ownerNotes',          title: 'Notes',                          type: 'text', rows: 2 }),
      ],
    }),

    // ── Advertiser ────────────────────────────────────────────────────────────

    defineField({
      group:   'advertiser',
      name:    'advertiserInfo',
      title:   'Advertiser Details',
      type:    'object',
      hidden:  ({ document }: any) => !((document?.partyRole ?? []) as string[]).includes('advertiser'),
      options: { collapsible: false },
      fields: [
        defineField({
          name:    'businessCategory',
          title:   'Business Category',
          type:    'string',
          options: { list: [
            { title: '🍜 F&B',       value: 'fnb'      },
            { title: '🛍️ Retail',    value: 'retail'   },
            { title: '💼 Services',  value: 'services' },
            { title: '🏠 Property',  value: 'property' },
            { title: '🏦 Finance',   value: 'finance'  },
            { title: '🏥 Health',    value: 'health'   },
            { title: 'Other',        value: 'other'    },
          ]},
        }),
        defineField({
          name:    'campaignTypes',
          title:   'Campaign Types',
          type:    'array',
          of:      [defineArrayMember({ type: 'string' })],
          options: { list: [
            { title: '📣 Brand Awareness', value: 'awareness'  },
            { title: '🏷️ Promotion',       value: 'promotion'  },
            { title: '📅 Event',            value: 'event'      },
            { title: '🔄 Ongoing',          value: 'ongoing'    },
          ]},
        }),
        defineField({
          name:    'preferredScreenLocations',
          title:   'Preferred Screen Locations',
          type:    'array',
          of:      [defineArrayMember({ type: 'string' })],
          options: { list: [
            { title: 'Lobby',        value: 'lobby'       },
            { title: 'Elevator',     value: 'elevator'    },
            { title: 'Common Area',  value: 'common_area' },
            { title: 'All',          value: 'all'         },
          ]},
        }),
        defineField({ name: 'monthlyBudgetTHB', title: 'Monthly Budget (THB)', type: 'string' }),
      ],
    }),

    // ── Agent / Broker ────────────────────────────────────────────────────────

    defineField({
      group:   'agent',
      name:    'agentInfo',
      title:   'Agent / Broker Details',
      type:    'object',
      hidden:  ({ document }: any) => !((document?.partyRole ?? []) as string[]).includes('agent'),
      options: { collapsible: false },
      fields: [
        defineField({ name: 'agencyName',      title: 'Agency / Company',                    type: 'string' }),
        defineField({ name: 'licenseNumber',   title: 'License Number (if applicable)',       type: 'string' }),
        defineField({ name: 'commissionRate',  title: 'Commission Rate (%)',                  type: 'string' }),
        defineField({
          name:    'specialization',
          title:   'Specialization',
          type:    'array',
          of:      [defineArrayMember({ type: 'string' })],
          options: { list: [
            { title: '📺 Signage Business', value: 'signage'  },
            { title: '🏠 Property',         value: 'property' },
            { title: 'Other',               value: 'other'    },
          ]},
        }),
        defineField({ name: 'agentNotes', title: 'Notes', type: 'text', rows: 2 }),
      ],
    }),

    // ── Developer ─────────────────────────────────────────────────────────────

    defineField({
      group:   'developer',
      name:    'developerInfo',
      title:   'Developer Details',
      type:    'object',
      hidden:  ({ document }: any) => !((document?.partyRole ?? []) as string[]).includes('developer'),
      options: { collapsible: false },
      fields: [
        defineField({
          name:    'projectTypes',
          title:   'Project Types',
          type:    'array',
          of:      [defineArrayMember({ type: 'string' })],
          options: { list: [
            { title: '🏢 Condominium', value: 'condo'      },
            { title: '🏠 House',       value: 'house'       },
            { title: '🏬 Commercial',  value: 'commercial'  },
            { title: '🏗️ Mixed Use',   value: 'mixed'       },
          ]},
        }),
        defineField({ name: 'numberOfActiveProjects', title: 'Active Projects',          type: 'number' }),
        defineField({ name: 'developerNotes',         title: 'Notes / Key Contact Info', type: 'text', rows: 2 }),
      ],
    }),

    // ── Tenant / Buyer ────────────────────────────────────────────────────────

    defineField({
      group:   'tenant',
      name:    'tenantInfo',
      title:   'Tenant / Buyer Details',
      type:    'object',
      hidden:  ({ document }: any) => !((document?.partyRole ?? []) as string[]).includes('tenant'),
      options: { collapsible: false },
      fields: [
        defineField({ name: 'unitReference', title: 'Unit / Room Reference', type: 'string', description: 'e.g. "Tower A, Floor 12, Unit 1201"' }),
        defineField({
          name:    'tenancyType',
          title:   'Tenancy Type',
          type:    'string',
          options: { list: [
            { title: '🔑 Renting',    value: 'rent'     },
            { title: '🏠 Purchased',  value: 'purchase' },
          ]},
        }),
        defineField({ name: 'moveInDate',   title: 'Move-in Date',    type: 'date' }),
        defineField({ name: 'leaseExpiry',  title: 'Lease Expiry',    type: 'date' }),
        defineField({ name: 'tenantNotes',  title: 'Notes',           type: 'text', rows: 2 }),
      ],
    }),

    // ── Vendor / Supplier ─────────────────────────────────────────────────────

    defineField({
      group:   'vendor',
      name:    'vendorInfo',
      title:   'Vendor Details',
      type:    'object',
      hidden:  ({ document }: any) => !((document?.partyRole ?? []) as string[]).includes('vendor'),
      options: { collapsible: false },
      fields: [
        defineField({
          name:        'productCategories',
          title:       'Product Categories',
          type:        'array',
          of:          [defineArrayMember({ type: 'string' })],
          options: {
            list: [
              { title: 'LED / LCD Screens',    value: 'screens'     },
              { title: 'Hardware / Mounts',    value: 'hardware'    },
              { title: 'Cables & Accessories', value: 'accessories' },
              { title: 'Networking',           value: 'networking'  },
              { title: 'Other',                value: 'other'       },
            ],
          },
        }),
        defineField({ name: 'paymentTermsDays', title: 'Payment Terms (days)', type: 'number', hidden: true }),
        defineField({ name: 'leadTimeDays',     title: 'Lead Time (days)',      type: 'number' }),
        defineField({ name: 'warrantyTerms',    title: 'Warranty Terms',        type: 'text', rows: 2 }),
        // bankAccount moved to top-level Financial & Billing tab
        defineField({
          name: 'bankAccount', title: 'Bank Account (legacy — use Financial tab)', type: 'object',
          hidden: true,
          fields: [
            defineField({ name: 'bankName',      title: 'Bank Name',      type: 'string' }),
            defineField({ name: 'accountName',   title: 'Account Name',   type: 'string' }),
            defineField({ name: 'accountNumber', title: 'Account Number', type: 'string' }),
            defineField({ name: 'branch',        title: 'Branch',         type: 'string' }),
          ],
        }),
      ],
    }),

    // ── Service Provider ──────────────────────────────────────────────────────

    defineField({
      group:   'serviceProvider',
      name:    'serviceProviderInfo',
      title:   'Service Provider Details',
      type:    'object',
      hidden:  ({ document }: any) => !((document?.partyRole ?? []) as string[]).includes('serviceProvider'),
      options: { collapsible: false },
      fields: [
        defineField({
          name:        'serviceTypes',
          title:       'Service Types',
          type:        'array',
          of:          [defineArrayMember({ type: 'string' })],
          options: {
            list: [
              { title: '⚡ Electrical',          value: 'electrical'   },
              { title: '🔧 Screen Installation', value: 'installation' },
              { title: '💻 IT / Networking',     value: 'it'           },
              { title: '📶 Wi-Fi Setup',         value: 'wifi'         },
              { title: '🔨 Civil Works',         value: 'civil'        },
              { title: '🔄 Maintenance',         value: 'maintenance'  },
              { title: 'Other',                  value: 'other'        },
            ],
          },
        }),
        defineField({ name: 'coverageArea',    title: 'Coverage Area',     type: 'string', description: 'e.g. "Bangkok & Vicinity"' }),
        defineField({ name: 'rateCard',        title: 'Rate Card / Notes', type: 'text', rows: 3 }),
        defineField({ name: 'certifications',  title: 'Certifications',    type: 'string' }),
      ],
    }),

    // ── App Vendor ────────────────────────────────────────────────────────────

    defineField({
      group:   'appVendor',
      name:    'appVendorInfo',
      title:   'App Vendor Details',
      type:    'object',
      hidden:  ({ document }: any) => !((document?.partyRole ?? []) as string[]).includes('appVendor'),
      options: { collapsible: false },
      fields: [
        defineField({
          name:        'softwareProducts',
          title:       'Software Products',
          type:        'array',
          of:          [defineArrayMember({ type: 'string' })],
          options: {
            list: [
              { title: 'Yodeck',              value: 'yodeck'      },
              { title: 'Fully Kiosk Browser', value: 'fully_kiosk' },
              { title: 'Volume Lock',         value: 'volume_lock' },
              { title: 'Custom App',          value: 'custom'      },
              { title: 'Other',               value: 'other'       },
            ],
          },
        }),
        defineField({ name: 'supportEmail',   title: 'Support Email',              type: 'string' }),
        defineField({ name: 'supportPhone',   title: 'Support Phone',              type: 'string' }),
        defineField({ name: 'licenseModel',   title: 'License Model',              type: 'string', description: 'e.g. "Per device / monthly"' }),
        defineField({ name: 'contractExpiry', title: 'Contract / License Expiry',  type: 'date'   }),
      ],
    }),

    // ── Legacy fields — hidden, kept for backward compatibility ───────────────
    defineField({ name: 'landlordInfo',  title: 'Landlord Info (legacy)',  type: 'object', hidden: true, fields: [
      defineField({ name: 'juristicOfficeName',    title: 'Juristic Office Name',  type: 'string' }),
      defineField({ name: 'buildingRules',         title: 'Building Rules',        type: 'text'   }),
      defineField({ name: 'preferredContactHours', title: 'Contact Hours',         type: 'string' }),
      defineField({ name: 'parkingAvailable',      title: 'Parking Available',     type: 'boolean' }),
    ]}),
    defineField({ name: 'customerInfo', title: 'Customer Info (legacy)', type: 'object', hidden: true, fields: [
      defineField({ name: 'customerType',       title: 'Customer Type',    type: 'array', of: [defineArrayMember({ type: 'string' })] }),
      defineField({ name: 'businessCategory',   title: 'Business Cat.',    type: 'string' }),
      defineField({ name: 'preferredChannel',   title: 'Pref. Channel',    type: 'string' }),
    ]}),

  ],

  preview: {
    select: {
      identityType:    'identityType',
      legalNameTh:     'legalName_th',
      legalNameEn:     'legalName_en',
      legalNameLegacy: 'legalName',
      firstName:       'firstName',
      lastName:        'lastName',
      partyRole:       'partyRole',
    },
    prepare({ identityType, legalNameTh, legalNameEn, legalNameLegacy, firstName, lastName, partyRole }) {
      const roleEmoji: Record<string, string> = {
        juristicPerson:  '🏛️',
        propertyOwner:   '🏠',
        advertiser:      '📢',
        agent:           '🤝',
        developer:       '🏗️',
        tenant:          '🏡',
        vendor:          '📦',
        serviceProvider: '🔧',
        appVendor:       '💻',
        // legacy
        landlord:        '🏢',
        customer:        '👤',
      }
      const roles = ((partyRole ?? []) as string[]).map(r => roleEmoji[r] ?? r).join(' ')

      if (identityType === 'individual') {
        const name = [firstName, lastName].filter(Boolean).join(' ') || '(No name)'
        return { title: name, subtitle: roles || 'No roles assigned' }
      }

      // Corporate: prefer English name as title; show Thai in subtitle
      const title    = legalNameEn || legalNameTh || legalNameLegacy || '(No name)'
      const subtitle = [
        legalNameEn && legalNameTh ? legalNameTh : null,
        roles || 'No roles assigned',
      ].filter(Boolean).join('  ·  ')

      return { title, subtitle }
    },
  },
})
