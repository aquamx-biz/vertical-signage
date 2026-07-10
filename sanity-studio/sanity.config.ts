import { defineConfig, definePlugin } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemas'
import { initPlaylistAction }    from './actions/initPlaylistAction'
import { ProjectPublishAction } from './actions/projectPublishAction'
import { AddToPlaylistAction }  from './actions/addToPlaylistAction'
import { MediaPublishAction }   from './actions/mediaPublishAction'
import { DocumentOverview }     from './views/DocumentOverview'
import { MediaOverview }        from './views/MediaOverview'
import { OfferOverview }        from './views/OfferOverview'
import { ProviderOverview }     from './views/ProviderOverview'
import { AILookupAction }      from './actions/AILookupAction'
import { AIPartyLookupAction } from './actions/AIPartyLookupAction'
import { MarkAsSignedAction }             from './actions/MarkAsSignedAction'
import { ProtectedProjectDeleteAction }  from './actions/ProtectedProjectDeleteAction'
import { SuspendProjectAction, ReactivateProjectAction, TerminateProjectAction } from './actions/ProjectStatusActions'
import { CreatePartyFromContractAction } from './actions/CreatePartyFromContractAction'
import { ImportFromContractAction }      from './actions/ImportFromContractAction'
import { GenerateView }         from './views/GenerateView'
import { ApprovalView }         from './views/ApprovalView'
import { ActivityView }         from './views/ActivityView'
import { InstallationOverview }  from './views/InstallationOverview'
import { AssetRegisterView }     from './components/AssetRegisterView'
import { AssetRegisterListPane } from './components/AssetRegisterListPane'
import { PartyOverview }        from './views/PartyOverview'
import { LeadOverview }              from './views/LeadOverview'
import { SaleOpportunityOverview }  from './views/SaleOpportunityOverview'
import { dataImportPlugin }     from './plugins/data-import'
import { PlaylistView }            from './views/PlaylistView'
import { DirectoryView }           from './views/DirectoryView'
import { FinancialStatementView }  from './components/FinancialStatementView'
import { FiscalYearListPane }      from './components/FiscalYearListPane'
import { LedgerListPane }          from './components/LedgerListPane'
import { LedgerOverview }         from './components/LedgerOverview'
import { AccountCodeTreeView }    from './tools/AccountCodeTreeView'
import { HowToTool }            from './tools/HowToTool'
import { DashboardTool }        from './tools/DashboardTool'
import { PartyMigrationTool }   from './tools/PartyMigrationTool'
import { ScreenHealthTool }     from './tools/ScreenHealthTool'
import { accessControlPlugin, accessStore } from './plugins/accessControl'
import { paneWidthOverride }               from './plugins/paneWidthOverride'

const howToPlugin = definePlugin({
  name: 'how-to-guide',
  tools: [
    {
      name:      'how-to',
      title:     'How-To Guide',
      component: HowToTool,
    },
  ],
})

const dashboardPlugin = definePlugin({
  name: 'ops-dashboard',
  tools: [
    {
      name:      'dashboard',
      title:     'Dashboard',
      component: DashboardTool,
    },
    {
      name:      'party-migration',
      title:     'Party Migration',
      component: PartyMigrationTool,
    },
    {
      name:      'screen-health',
      title:     'Screen Health',
      component: ScreenHealthTool,
    },
  ],
})

const PROJECT_ID = 'awjj9g8u'
const DATASET    = 'production'

export default defineConfig({
  name: 'vertical-signage-studio',
  title: 'Vertical Signage CMS',

  projectId: PROJECT_ID,
  dataset:   DATASET,

  plugins: [
    paneWidthOverride(),
    accessControlPlugin(),
    structureTool({
      // Every document opens in read-only Overview by default.
      // The user clicks the "Edit" tab to make changes.
      // Exception: the categoryConfig singleton skips Overview and shows the form directly.
      defaultDocumentNode: (S, { schemaType }) => {
        if (schemaType === 'categoryConfig' || schemaType === 'ratecard') {
          return S.document().views([S.view.form().id('edit').title('Edit')])
        }
        if (schemaType === 'contract') {
          return S.document().views([
            S.view.component(DocumentOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ApprovalView).id('approval').title('Approval'),
            S.view.component(GenerateView).id('generate').title('Generate'),
            S.view.component(ActivityView).id('activity').title('Activity'),
          ])
        }
        if (schemaType === 'projectSite') {
          return S.document().views([
            S.view.component(DocumentOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ApprovalView).id('approval').title('Approval'),
            S.view.component(ActivityView).id('activity').title('Activity'),
          ])
        }
        if (schemaType === 'provider') {
          return S.document().views([
            S.view.component(ProviderOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
          ])
        }
        if (schemaType === 'offer') {
          return S.document().views([
            S.view.component(OfferOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
          ])
        }
        if (schemaType === 'media') {
          return S.document().views([
            S.view.component(MediaOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
          ])
        }
        if (schemaType === 'party') {
          return S.document().views([
            S.view.component(PartyOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
          ])
        }
        if (schemaType === 'lead') {
          return S.document().views([
            S.view.component(LeadOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
          ])
        }
        if (schemaType === 'saleOpportunity') {
          return S.document().views([
            S.view.component(SaleOpportunityOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
          ])
        }
        if (schemaType === 'procurement') {
          return S.document().views([
            S.view.component(DocumentOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ApprovalView).id('approval').title('Approval'),
            S.view.component(GenerateView).id('generate').title('Generate'),
          ])
        }
        if (schemaType === 'payment') {
          return S.document().views([
            S.view.component(DocumentOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ApprovalView).id('approval').title('Approval'),
            S.view.component(ActivityView).id('activity').title('Activity'),
          ])
        }
        if (schemaType === 'financialStatement') {
          return S.document().views([
            S.view.component(FinancialStatementView).id('fs-view').title('Statements'),
            S.view.form().id('edit').title('Documents'),
          ])
        }
        if (schemaType === 'assetRegister') {
          return S.document().views([
            S.view.component(AssetRegisterView).id('register').title('Asset Register'),
            S.view.form().id('edit').title('Settings'),
          ])
        }
        if (schemaType === 'installation') {
          return S.document().views([
            S.view.component(InstallationOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ActivityView).id('activity').title('Activity'),
          ])
        }
        if (schemaType === 'project') {
          return S.document().views([
            S.view.component(DocumentOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(DirectoryView).id('directory').title('Directory'),
            S.view.component(ActivityView).id('activity').title('Activity'),
          ])
        }
        if (schemaType === 'ledger') {
          return S.document().views([
            S.view.component(LedgerOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
          ])
        }
        return S.document().views([
          S.view.component(DocumentOverview).id('overview').title('Overview'),
          S.view.form().id('edit').title('Edit'),
        ])
      },

      structure: (S, context) => {
        const email   = context.currentUser?.email?.toLowerCase() ?? ''
        const isAdmin = context.currentUser?.roles?.some(r => r.name === 'administrator') ?? false

        // `can(id)` — true if this user is allowed to see the section
        const can = (id: string) =>
          isAdmin || !accessStore.loaded || (accessStore.config[email] ?? []).includes(id)

        // ── Helper: grouped folder ─────────────────────────────────────────
        const group = (id: string, title: string, icon: string, children: any[]) =>
          S.listItem()
            .id(id)
            .title(`${icon}  ${title}`)
            .child(S.list().title(title).items(children.filter(Boolean)))

        // Build each section conditionally; filter out falsy entries
        const items = [

          // ── Digital Signage ────────────────────────────────────────────────
          (can('project') || can('playlist') || can('media') || can('offer') || can('provider') || can('categoryConfig') || can('ratecard')) &&
          group('digital-signage', 'Digital Signage', '🖥', [
            can('project')  && S.documentTypeListItem('project').title('Projects'),
            can('playlist') && S.listItem()
              .id('playlist')
              .title('Playlist')
              .child(
                S.documentTypeList('project')
                  .title('Playlist — Select Project')
                  .child(projectId =>
                    S.document()
                      .documentId(projectId)
                      .schemaType('project')
                      .views([
                        S.view.component(PlaylistView).id('playlist').title('Playlist'),
                      ])
                  )
              ),
            can('media')    && S.listItem()
              .id('media-library')
              .title('Media Library')
              .child(
                S.list().title('Media Library').items([
                  S.listItem()
                    .id('media-all')
                    .title('All Media')
                    .child(S.documentTypeList('media').title('All Media')),
                  S.listItem()
                    .id('media-by-project')
                    .title('By Project')
                    .child(
                      S.documentTypeList('project')
                        .title('Media — Select Project')
                        .filter('_type == "project" && isActive == true')
                        .child(projectId =>
                          S.documentList()
                            .id(`media-for-${projectId}`)
                            .title('Project Media')
                            .schemaType('media')
                            .filter('_type == "media" && references($projectId)')
                            .params({ projectId })
                            .canHandleIntent((name, params) =>
                              name === 'edit' && params.type === 'media'
                            )
                        )
                    ),
                ])
              ),
            S.divider(),
            can('offer')    && S.documentTypeListItem('offer').title('Offers'),
            can('provider') && S.documentTypeListItem('provider').title('Providers'),
            can('categoryConfig') && S.listItem()
              .title('Global Category Config')
              .id('categoryConfig-global')
              .child(
                S.document()
                  .schemaType('categoryConfig')
                  .documentId('categoryConfig-global')
                  .title('Global Category Config')
              ),
            can('ratecard') && S.listItem()
              .title('Rate Card (website)')
              .id('ratecard-sme')
              .child(
                S.document()
                  .schemaType('ratecard')
                  .documentId('ratecard-sme')
                  .title('Rate Card — SME')
              ),
          ]),

          // ── CRM ────────────────────────────────────────────────────────────
          (can('party') || can('lead') || can('saleOpportunity') || can('emailCampaign')) &&
          group('crm', 'CRM', '👥', [
            can('party')           && S.documentTypeListItem('party').title('Parties'),
            can('lead')            && S.documentTypeListItem('lead').title('Leads'),
            can('saleOpportunity') && S.documentTypeListItem('saleOpportunity').title('Sale Opportunities'),
            can('emailCampaign')   && S.documentTypeListItem('emailCampaign').title('Email Campaigns'),
          ]),

          // ── Projects ───────────────────────────────────────────────────────
          (can('projectSite') || can('contract') || can('serviceContract') || can('installation')) &&
          group('projects', 'Projects', '🏗', [
            can('projectSite')        && S.documentTypeListItem('projectSite').title('Project Sites'),
            can('contract')           && S.documentTypeListItem('contract').title('Rent Space').child(
              S.documentTypeList('contract').title('Rent Space').defaultOrdering([{ field: 'quotationNumber', direction: 'desc' }])
            ),
            can('serviceContract')    && S.documentTypeListItem('serviceContract').title('Service Contracts'),
            S.divider(),
            can('installation')       && S.documentTypeListItem('installation').title('Install & Activate'),
          ]),

          // ── Finance ────────────────────────────────────────────────────────
          (can('payment') || can('procurement') || can('receipt') || can('funding') || can('journalEntry') || can('asset') || can('assetRegister') || can('ledger') || can('financialStatement')) &&
          group('finance', 'Finance', '💰', [
            can('payment')           && S.documentTypeListItem('payment').title('Payments'),
            can('procurement')       && S.documentTypeListItem('procurement').title('Procurements'),
            can('receipt')           && S.documentTypeListItem('receipt').title('Receipts'),
            can('funding')           && S.documentTypeListItem('funding').title('Funding'),
            S.divider(),
            can('journalEntry')       && S.documentTypeListItem('journalEntry').title('Journal Entries'),
            can('asset')              && S.documentTypeListItem('asset').title('Assets'),
            can('assetRegister')      && S.listItem().title('Asset Register').id('asset-register-pane').child(
              S.component(AssetRegisterListPane).id('asset-register-list').title('Asset Register')
            ),
            can('ledger')             && S.listItem().title('General Ledger').id('gl-pane').child(
              S.component(LedgerListPane).id('gl-list').title('General Ledger')
            ),
            can('financialStatement') && S.listItem().title('Financial Statements').id('fs-pane').child(
              S.component(FiscalYearListPane).id('fs-year-select').title('Select Period')
            ),
          ]),

          // ── Approvals ──────────────────────────────────────────────────────
          (can('approvalPosition') || can('approvalRule') || can('approvalRequest')) &&
          group('approvals', 'Approvals', '✅', [
            can('approvalRequest')  && S.documentTypeListItem('approvalRequest').title('Approval Requests'),
            S.divider(),
            can('approvalRule')     && S.documentTypeListItem('approvalRule').title('Approval Rules'),
            can('approvalPosition') && S.documentTypeListItem('approvalPosition').title('Approver Positions'),
          ]),

          // ── Operations ─────────────────────────────────────────────────────
          (can('contractType') || isAdmin) &&
          group('operations', 'Operations', '⚙️', [
            can('contractType') && S.documentTypeListItem('contractType').title('Process Setup'),
            S.divider(),
            isAdmin && S.listItem()
              .id('account-codes-tree')
              .title('Account Codes')
              .child(
                S.component(AccountCodeTreeView)
                  .id('account-codes-tree-pane')
                  .title('Account Codes')
              ),
            isAdmin && S.documentTypeListItem('accountCodeGroup').title('Account Code Groups'),
            isAdmin && S.documentTypeListItem('fiscalYearConfig').title('Fiscal Year Config'),
          ]),

          // ── Admin only ─────────────────────────────────────────────────────
          isAdmin && S.divider(),
          isAdmin && S.listItem()
            .title('🔐 Studio Access Control')
            .id('studio-access-config')
            .child(
              S.document()
                .schemaType('studioAccess')
                .documentId('studio-access-config')
                .title('Studio Access Control')
            ),

        ].filter(Boolean)

        return S.list().title('Content').items(items as any)
      },
    }),

    dashboardPlugin(),
    dataImportPlugin(),
    howToPlugin(),
    visionTool(),
  ],

  schema: { types: schemaTypes },

  // ── Initial value templates ───────────────────────────────────────────────
  // Used by the Playlist list-item in the structure above so that clicking "+"
  // pre-fills the project reference on the new playlist item.
  templates: (prev: any[]) => [
    ...prev,
    {
      id:         'playlistItem-by-project',
      title:      'Playlist Item',
      schemaType: 'playlistItem',
      parameters: [{ name: 'projectId', type: 'string', title: 'Project ID' }],
      value: ({ projectId }: { projectId: string }) => ({
        project: { _type: 'reference', _ref: projectId },
        order:   1,
        enabled: true,
      }),
    },
  ],

  // ── Document actions ──────────────────────────────────────────────────────
  document: {
    actions: (prev, ctx) => {
      if (ctx.schemaType === 'project') {
        // Replace the first action (always Publish) with our version that
        // auto-creates a playlist item on first publish.
        // Replace the default delete with ProtectedProjectDeleteAction so
        // active/deployed projects cannot be accidentally deleted.
        // Keep initPlaylistAction as a manual fallback button.
        const [_defaultPublish, ...rest] = prev
        const withProtectedDelete = rest.map(a =>
          (a as any).action === 'delete' ? ProtectedProjectDeleteAction : a
        )
        return [
          ProjectPublishAction,
          ...withProtectedDelete,
          initPlaylistAction,
          SuspendProjectAction,
          ReactivateProjectAction,
          TerminateProjectAction,
        ]
      }
      if (ctx.schemaType === 'media') {
        // Replace default Publish with MediaPublishAction (handles addToPlaylistOnPublish).
        // Keep AddToPlaylistAction as a manual fallback in the ••• menu.
        // AI poster reading lives in the inline button on the Poster Image field
        // (PosterImageAIInput) — no document-action entry needed.
        const [_defaultPublish, ...rest] = prev
        return [MediaPublishAction, ...rest, AddToPlaylistAction]
      }
      if (ctx.schemaType === 'categoryConfig' || ctx.schemaType === 'ratecard') {
        // Singleton — block delete and duplicate so it can't be destroyed or duplicated.
        return prev.filter(a => !['delete', 'duplicate'].includes((a as any).action))
      }
      if (ctx.schemaType === 'contract') {
        return [...prev, CreatePartyFromContractAction]
      }
      if (ctx.schemaType === 'projectSite') {
        return [...prev, AILookupAction]
      }
      if (ctx.schemaType === 'party') {
        return [...prev, AIPartyLookupAction, ImportFromContractAction]
      }
      return prev
    },
  },
})
