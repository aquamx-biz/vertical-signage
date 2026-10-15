import { defineField, defineType, defineArrayMember } from 'sanity'
import { AllowedSchemasInput } from '../components/AllowedSchemasInput'

/**
 * studioAccess — singleton document that controls which schemas
 * each user can see in Sanity Studio.
 *
 * Administrators always see everything regardless of this config.
 * Only one document of this type should exist (_id: 'studio-access-config').
 */

const SCHEMA_OPTIONS = [
  // ── Digital Signage ──────────────────────────────────────────────────────
  { title: '📁 Projects',               value: 'project'          },
  { title: '🎬 Playlist',               value: 'playlist'         },
  { title: '🖼  Media Library',          value: 'media'            },
  { title: '🛍  Offers',                 value: 'offer'            },
  { title: '🏪 Providers',              value: 'provider'         },
  { title: '⚙️  Global Category Config', value: 'categoryConfig'   },
  // ── CRM ─────────────────────────────────────────────────────────────────
  { title: '👥 Parties',                value: 'party'            },
  { title: '🎯 Leads',                  value: 'lead'             },
  { title: '💼 Sale Opportunities',     value: 'saleOpportunity'  },
  { title: '📧 Email Campaigns',        value: 'emailCampaign'    },
  // ── Projects ─────────────────────────────────────────────────────────────
  { title: '📍 Project Sites',          value: 'projectSite'      },
  { title: '📄 Contracts',              value: 'contract'         },
  { title: '📑 Service Contracts',      value: 'serviceContract'  },
  { title: '🔧 Install & Activate',     value: 'installation'     },
  // ── Finance ──────────────────────────────────────────────────────────────
  { title: '💳 Payments',               value: 'payment'          },
  { title: '🧾 Invoices / Receipts',    value: 'invoiceReceipt'   },
  { title: '💰 Funding',                value: 'funding'          },
  { title: '📦 Procurements',           value: 'procurement'      },
  { title: '📒 Journal Entries',        value: 'journalEntry'     },
  { title: '🏷  Assets',                 value: 'asset'            },
  { title: '📋 Asset Register',         value: 'assetRegister'    },
  { title: '📊 General Ledger',         value: 'ledger'           },
  { title: '📈 Financial Statements',   value: 'financialStatement' },
  // ── Approvals ────────────────────────────────────────────────────────────
  { title: '👤 Approver Positions',     value: 'approvalPosition' },
  { title: '📏 Approval Rules',         value: 'approvalRule'     },
  { title: '✅ Approval Requests',      value: 'approvalRequest'  },
  // ── Operations ───────────────────────────────────────────────────────────
  { title: '📋 Process Setup',          value: 'contractType'     },
]

export default defineType({
  name:  'studioAccess',
  title: 'Studio Access Control',
  type:  'document',

  fields: [
    defineField({
      name:        'userPermissions',
      title:       'User Permissions',
      type:        'array',
      description: 'Configure which sections each user can see. Administrators always see everything.',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name:        'label',
              title:       'Name',
              type:        'string',
              description: 'e.g. "Khun Somchai — Sales"',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:        'userEmail',
              title:       'Email',
              type:        'string',
              description: 'Must match the email used to log in to Sanity.',
              validation:  Rule => Rule.required().email(),
            }),
            defineField({
              name:        'allowedSchemas',
              title:       'Can See',
              type:        'array',
              of:          [{ type: 'string' }],
              options:     { list: SCHEMA_OPTIONS, layout: 'grid' },
              description: 'Tick the sections this user is allowed to access.',
              components:  { input: AllowedSchemasInput },
            }),
          ],
          preview: {
            select: { label: 'label', email: 'userEmail', schemas: 'allowedSchemas' },
            prepare({ label, email, schemas }: { label?: string; email?: string; schemas?: string[] }) {
              const count = schemas?.length ?? 0
              return {
                title:    label ?? email ?? '(Unnamed)',
                subtitle: count > 0
                  ? `${count} section${count > 1 ? 's' : ''}: ${(schemas ?? []).join(', ')}`
                  : '⛔ No access configured',
              }
            },
          },
        }),
      ],
    }),
  ],

  preview: {
    select: { users: 'userPermissions' },
    prepare({ users }: { users?: any[] }) {
      return {
        title:    'Studio Access Control',
        subtitle: `${users?.length ?? 0} user(s) configured`,
      }
    },
  },
})
