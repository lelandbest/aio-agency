# Service Contract Map

> **Generated:** 2026-04-29
> **Architecture:** UI → Services → API → Backend
> **Enforcement:** ESLint `no-restricted-imports` + CI scanner (`scripts/enforce-service-layer.js`)

UI modules (`src/components/`, `src/modules/`, `src/pages/`) must import from domain services only — never from `backendApi` directly. Only `src/services/*.service.js` files may import from `backendApi`.

---

## Re-exported Utilities

These utilities were previously imported directly from `backendApi` by UI code. They are now re-exported from their domain service so UI modules never touch `backendApi`.

| Utility | Re-exported from | Original source |
|---|---|---|
| `toSnakeCase` | `CrmService` | `backendApi` |
| `normalizeSourceUrl` | `FormsService` | `backendApi` |
| `getApiBaseUrl` | `MediaService` | `backendApi` |
| `withSessionToken` | `MediaService` | `backendApi` |

---

## AiService

**File:** `src/services/ai.service.js`

| Export | Description |
|---|---|
| `draftAi` | Draft AI content |
| `getOperatorAssistResponse` | Get operator assist response |
| `runAiCommand` | Run an AI command |
| `getAiRuns` | List AI runs |
| `getAiRun` | Get single AI run |
| `getAiAgents` | List AI agents |
| `updateAiAgent` | Update an AI agent |
| `getSystemHealth` | Get system health status |
| `getAiProviderCatalog` | Get AI provider catalog |
| `getOllamaModels` | Get Ollama models (direct fetch) |
| `getAiProviderConfigs` | List AI provider configs |
| `upsertAiProviderConfig` | Upsert AI provider config |
| `deleteAiProviderConfig` | Delete AI provider config |
| `testAiProviderConfig` | Test AI provider config |
| `getWorkspaces` | List workspaces |
| `createWorkspace` | Create workspace |
| `updateWorkspace` | Update workspace |
| `deleteWorkspace` | Delete workspace |
| `getWorkspaceMemberships` | Get workspace memberships |
| `addWorkspaceMember` | Add workspace member |
| `createWorkspaceUser` | Create workspace user |
| `updateWorkspaceMember` | Update workspace member |
| `removeWorkspaceMember` | Remove workspace member |
| `getWorkspaceRoles` | Get workspace roles |
| `createWorkspaceRole` | Create workspace role |
| `updateWorkspaceRole` | Update workspace role |
| `attachWorkspaceRole` | Attach role to workspace |
| `detachWorkspaceRole` | Detach role from workspace |
| `sendVttCommand` | Send VTT command (raw request) |
| `sendAiCommandRaw` | Send raw AI command (raw request) |

---

## AnalyticsService

**File:** `src/services/analytics.service.js`

| Export | Description |
|---|---|
| `getOmegaStatus` | Get Omega status |
| `armOmega` | Arm Omega |
| `cancelOmega` | Cancel Omega |
| `executeOmega` | Execute Omega |
| `getAnalyticsSummary` | Get analytics summary |
| `generateReport` | Generate report |
| `ingestExternalData` | Ingest external data |
| `listExternalData` | List external data |
| `getExternalData` | Get external data entry |
| `deleteExternalData` | Delete external data |
| `ingestContentMetrics` | Ingest content metrics |
| `listContentMetrics` | List content metrics |

---

## AuthService

**File:** `src/services/auth.service.js`

| Export | Description |
|---|---|
| `getAuthStatus` | Get authentication status |
| `bootstrapOwner` | Bootstrap owner account |
| `login` | Log in |
| `getSession` | Get current session |
| `getProfile` | Get user profile |
| `updateProfile` | Update user profile |
| `uploadAvatar` | Upload user avatar |
| `deleteAvatar` | Delete user avatar |
| `changePassword` | Change user password |
| `getAuthSessions` | List auth sessions |
| `revokeAuthSession` | Revoke auth session |
| `exportUserData` | Export user data |
| `getExportStatus` | Get export status |
| `getExportDownloadUrl` | Get export download URL |
| `deleteUserAccount` | Delete user account |
| `logoutOtherSessions` | Logout other sessions |
| `logout` | Logout |
| `switchTenantSession` | Switch tenant session |
| `getGoogleAppAuthorizeUrl` | Get Google OAuth authorize URL |

---

## BrainService

**File:** `src/services/brain.service.js`

| Export | Description |
|---|---|
| `getBrainOverview` | Get brain overview |
| `getBrainProfile` | Get brain profile |
| `updateBrainProfile` | Update brain profile |
| `getBrainSources` | List brain sources |
| `createBrainSource` | Create brain source |
| `updateBrainSource` | Update brain source |
| `deleteBrainSource` | Delete brain source |
| `getBrainItems` | List brain items |
| `createBrainItem` | Create brain item |
| `updateBrainItem` | Update brain item |
| `deleteBrainItem` | Delete brain item |
| `getBrainLinks` | List brain links |
| `createBrainLink` | Create brain link |
| `deleteBrainLink` | Delete brain link |
| `getBrainIngests` | List brain ingests |
| `createBrainIngest` | Create brain ingest |
| `probeBrainMcp` | Probe brain MCP |
| `queryBrainMcp` | Query brain MCP |
| `searchBrainMemory` | Search brain memory |
| `saveTranscript` | Save transcript |

---

## CalendarService

**File:** `src/services/calendar.service.js`

| Export | Description |
|---|---|
| `getCalendars` | List calendars |
| `getCalendarEvents` | List calendar events |
| `createCalendarEvent` | Create calendar event |
| `updateCalendarEvent` | Update calendar event |
| `deleteCalendarEvent` | Delete calendar event |
| `pushCalendarEvent` | Push calendar event |
| `reconcileCalendarEvent` | Reconcile calendar event |
| `getCalendarSources` | List calendar sources |
| `getCalendarProviders` | List calendar providers |
| `createCalendarSource` | Create calendar source |
| `updateCalendarSource` | Update calendar source |
| `listCalendarSourceCalendars` | List source calendars |
| `deleteCalendarSource` | Delete calendar source |
| `disconnectCalendarSource` | Disconnect calendar source |
| `testCalendarSource` | Test calendar source |
| `syncCalendarSource` | Sync calendar source |
| `importCalendarSource` | Import calendar source |
| `getCalendarSourceAuthorizeUrl` | Get calendar OAuth URL |
| `getBookingTypes` | List booking types |
| `createBookingType` | Create booking type |
| `updateBookingType` | Update booking type |
| `deleteBookingType` | Delete booking type |

---

## CommsService

**File:** `src/services/comms.service.js`

| Export | Description |
|---|---|
| `getCommsSnapshot` | Get communications snapshot |
| `createThread` | Create thread |
| `openThreadForContact` | Open thread for contact |
| `sendThreadMessage` | Send thread message |
| `sendThreadEmail` | Send thread email |
| `updateThreadStatus` | Update thread status |
| `assignThread` | Assign thread |
| `updateThreadMailbox` | Update thread mailbox |
| `summarizeThread` | Summarize thread |
| `createThreadDraft` | Create thread draft |
| `createDealFromThread` | Create deal from thread |
| `advanceThreadStage` | Advance thread stage |
| `scheduleThreadMeeting` | Schedule thread meeting |
| `createThreadReport` | Create thread report |
| `deleteThread` | Delete thread |
| `getCommsOverview` | Get communications overview |
| `getPhoneNumbers` | List phone numbers |
| `createPhoneNumber` | Create phone number |
| `updatePhoneNumber` | Update phone number |
| `deletePhoneNumber` | Delete phone number |
| `getSmsThreads` | List SMS threads |
| `createSmsThread` | Create SMS thread |
| `addSmsMessage` | Add SMS message |
| `getSmsPlans` | List SMS plans |
| `createSmsPlan` | Create SMS plan |
| `updateSmsPlan` | Update SMS plan |
| `getSmsThread` | Get single SMS thread |
| `getSmsMessages` | List SMS messages |
| `sendSms` | Send SMS |
| `checkOptOut` | Check opt-out status |
| `getContactsWithPhone` | Get contacts with phone |
| `getExtensions` | List extensions |
| `createExtension` | Create extension |
| `getRingGroups` | List ring groups |
| `createRingGroup` | Create ring group |
| `getCallSessions` | List call sessions |
| `createCallSession` | Create call session |
| `updateCallSession` | Update call session |
| `startOutboundCall` | Start outbound call |
| `endCallSession` | End call session |
| `getCallSession` | Get single call session |
| `getCommsRoutes` | Get communications routes |
| `getCommsContactSummary` | Get comms contact summary |
| `createCommsActivity` | Create comms activity |
| `getCommsIntegrationInfo` | Get comms integration info |
| `getCommsProviderConfigs` | List comms provider configs |
| `saveCommsProviderConfig` | Save comms provider config |
| `verifyCommsProviderConfig` | Verify comms provider config |
| `deleteCommsProviderConfig` | Delete comms provider config |
| `getMailboxes` | List mailboxes |
| `createMailbox` | Create mailbox |
| `getMailboxProviders` | List mailbox providers |
| `updateMailbox` | Update mailbox |
| `deleteMailbox` | Delete mailbox |
| `disconnectMailbox` | Disconnect mailbox |
| `getMailboxEvents` | List mailbox events |
| `syncMailbox` | Sync mailbox |
| `testMailboxConnection` | Test mailbox connection |
| `getMailboxAuthorizeUrl` | Get mailbox OAuth URL |
| `ingestMailboxMessage` | Ingest mailbox message |

---

## ContactsService

**File:** `src/services/contacts.service.js`

| Export | Description |
|---|---|
| `fetchContacts` | List contacts |
| `createContact` | Create contact |
| `updateContact` | Update contact |
| `deleteContact` | Delete contact |
| `restoreContact` | Restore deleted contact |
| `listDeletedContacts` | List soft-deleted contacts |
| `bulkDeleteContacts` | Bulk delete contacts |
| `getContactActivities` | List contact activities |
| `createContactActivity` | Create contact activity |
| `getContactFormSubmissions` | List contact form submissions |

---

## CrmService

**File:** `src/services/crm.service.js`
**Re-exports:** `toSnakeCase`

| Export | Description |
|---|---|
| `getContacts` | List contacts (CRM) |
| `createContact` | Create contact (CRM) |
| `updateContact` | Update contact (CRM) |
| `deleteContact` | Delete contact (CRM) |
| `restoreContact` | Restore contact (CRM) |
| `listDeletedContacts` | List deleted contacts (CRM) |
| `bulkDeleteContacts` | Bulk delete contacts (CRM) |
| `getContactActivities` | List contact activities (CRM) |
| `createContactActivity` | Create contact activity (CRM) |
| `getContactFormSubmissions` | List form submissions (CRM) |
| `getCompanies` | List companies |
| `getCompany` | Get single company |
| `updateCompany` | Update company |
| `getTags` | List tags |
| `createTag` | Create tag |
| `updateTag` | Update tag |
| `deleteTag` | Delete tag |
| `validateTagFormat` | Validate tag format |
| `CANONICAL_TAG_PREFIXES` | Canonical tag prefixes constant |
| `getCmsTables` | List CMS tables |
| `getCmsTableData` | Get CMS table data |

---

## FlowsService

**File:** `src/services/flows.service.js`

| Export | Description |
|---|---|
| `fetchFlows` | List flows |
| `getFlow` | Get single flow |
| `getFlowProviderStatuses` | Get flow provider statuses |
| `saveFlow` | Save flow |
| `triggerFlowManual` | Manually trigger flow |
| `saveFlowDraft` | Save flow draft |
| `getFlowDraft` | Get flow draft |
| `deleteFlowDraft` | Delete flow draft |
| `deleteFlow` | Delete flow |
| `bulkDeleteFlows` | Bulk delete flows |
| `importWorkflowJson` | Import workflow JSON |
| `createFlowFolder` | Create flow folder |
| `listFlowFolders` | List flow folders |
| `renameFlowFolder` | Rename flow folder |
| `deleteFlowFolder` | Delete flow folder |

---

## FormsService

**File:** `src/services/forms.service.js`
**Re-exports:** `normalizeSourceUrl`

| Export | Description |
|---|---|
| `fetchForms` | List forms |
| `createForm` | Create form |
| `updateForm` | Update form |
| `deleteForm` | Delete form |
| `bulkDeleteForms` | Bulk delete forms |
| `getFormFolders` | List form folders |
| `createFormFolder` | Create form folder |
| `updateFormFolder` | Update form folder |
| `deleteFormFolder` | Delete form folder |
| `getFormBySlug` | Get form by slug |
| `getFormById` | Get form by ID |
| `submitForm` | Submit form |

---

## HelpService

**File:** `src/services/help.service.js`

| Export | Description |
|---|---|
| `getHelpTickets` | List help tickets |
| `createHelpTicket` | Create help ticket |
| `updateHelpTicket` | Update help ticket |
| `getHelpArticles` | List help articles |
| `getHelpBroadcasts` | List help broadcasts |
| `generateDocs` | Generate documentation |
| `captureMissingHelp` | Capture missing help |
| `getNotifications` | List notifications |
| `markNotificationRead` | Mark notification read |
| `markAllNotificationsRead` | Mark all notifications read |
| `deleteNotification` | Delete notification |

---

## IntegrationsService

**File:** `src/services/integrations.service.js`

| Export | Description |
|---|---|
| `getAutomationProviderConfigs` | List automation provider configs |
| `upsertAutomationProviderConfig` | Upsert automation provider config |
| `deleteAutomationProviderConfig` | Delete automation provider config |
| `testAutomationProviderConfig` | Test automation provider config |
| `getPaymentProviderConfigs` | List payment provider configs |
| `upsertPaymentProviderConfig` | Upsert payment provider config |
| `deletePaymentProviderConfig` | Delete payment provider config |
| `testPaymentProviderConfig` | Test payment provider config |
| `getSocialProviderConfigs` | List social provider configs |
| `upsertSocialProviderConfig` | Upsert social provider config |
| `deleteSocialProviderConfig` | Delete social provider config |

---

## MediaService

**File:** `src/services/media.service.js`
**Re-exports:** `getApiBaseUrl`, `withSessionToken`

| Export | Description |
|---|---|
| `getMediaAssets` | List media assets |
| `getVault` | Get media vault |
| `getMediaRenderJobs` | List render jobs |
| `getMediaTranscriptJobs` | List transcript jobs |
| `getMediaTranscriptArtifacts` | List transcript artifacts |
| `getMediaScriptJobs` | List script jobs |
| `getMediaScriptArtifacts` | List script artifacts |
| `getMediaRunOfShowJobs` | List run-of-show jobs |
| `getMediaRunOfShowArtifacts` | List run-of-show artifacts |
| `getMediaAudioRenderJobs` | List audio render jobs |
| `getMediaPublishJobs` | List publish jobs |
| `getMediaPublishArtifacts` | List publish artifacts |
| `createMediaScriptJob` | Create script job |
| `createMediaRunOfShowJob` | Create run-of-show job |
| `createMediaAudioRenderJob` | Create audio render job |
| `generateAudioAsset` | Generate audio asset |
| `createMediaRenderJob` | Create render job |
| `getMediaRenderTemplates` | List render templates |
| `createMediaTranscriptJob` | Create transcript job |
| `ingestMeetingMedia` | Ingest meeting media |
| `uploadMediaFile` | Upload media file |
| `createMediaPublishJob` | Create publish job |
| `deleteMediaAsset` | Delete media asset |
| `deleteMediaJob` | Delete media job |
| `deleteMediaArtifact` | Delete media artifact |
| `getMediaJobStatus` | Get media job status |
| `probeMediaAsset` | Probe media asset |
| `getMediaProviderConfigs` | List media provider configs |
| `upsertMediaProviderConfig` | Upsert media provider config |
| `deleteMediaProviderConfig` | Delete media provider config |
| `testMediaProviderConfig` | Test media provider config |
| `voicePreview` | Get voice preview |
| `voicePreviewBlob` | Get voice preview as blob |
| `buildAssetUrl` | Build authenticated asset URL |

---

## OrdersService

**File:** `src/services/orders.service.js`

| Export | Description |
|---|---|
| `getOrders` | List orders |
| `createOrder` | Create order |
| `updateOrder` | Update order |
| `deleteOrder` | Delete order |

---

## SettingsService

**File:** `src/services/settings.service.js`

| Export | Description |
|---|---|
| `getGlobalVariables` | List global variables |
| `getCanonicalSettings` | Get canonical settings |
| `updateCanonicalTenantSettings` | Update canonical tenant settings |
| `upsertGlobalVariable` | Upsert global variable |
| `deleteGlobalVariable` | Delete global variable |
| `getSystemEmailTemplates` | List system email templates |
| `updateSystemEmailTemplate` | Update system email template |
| `getWorkspaces` | List workspaces |
| `createWorkspace` | Create workspace |
| `updateWorkspace` | Update workspace |
| `deleteWorkspace` | Delete workspace |
| `getWorkspaceMemberships` | Get workspace memberships |
| `getUserAccess` | Get user access |
| `addWorkspaceMember` | Add workspace member |
| `createWorkspaceUser` | Create workspace user |
| `updateWorkspaceMember` | Update workspace member |
| `removeWorkspaceMember` | Remove workspace member |
| `getWorkspaceRoles` | Get workspace roles |
| `createWorkspaceRole` | Create workspace role |
| `updateWorkspaceRole` | Update workspace role |
| `attachWorkspaceRole` | Attach role to workspace |
| `detachWorkspaceRole` | Detach role from workspace |
| `getEmailVerifierConfig` | Get email verifier config |
| `updateEmailVerifierConfig` | Update email verifier config |
| `testEmailVerifierConfig` | Test email verifier config |
| `deleteEmailVerifierConfig` | Delete email verifier config |
| `verifyEmail` | Verify email |
| `createEmailVerificationBulkTask` | Create bulk email verification |
| `getEmailVerificationBulkTask` | Get bulk email verification task |
| `getDataStoreProviderConfigs` | List data store provider configs |
| `upsertDataStoreProviderConfig` | Upsert data store provider config |
| `deleteDataStoreProviderConfig` | Delete data store provider config |
| `testDataStoreProviderConfig` | Test data store provider config |
| `readDataStoreRecords` | Read data store records |
| `createDataStoreRecord` | Create data store record |
| `updateDataStoreRecord` | Update data store record |
| `upsertDataStoreRecord` | Upsert data store record |

---

## SignalsService

**File:** `src/services/signals.service.js`

| Export | Description |
|---|---|
| `getSignals` | List signals |
| `dismissSignal` | Dismiss signal |
| `archiveSignals` | Archive signals |

---

## Enforcement

| Mechanism | Location | What it blocks |
|---|---|---|
| ESLint `no-restricted-imports` | `frontend/eslint.config.js` | All `*/backendApi` imports from `src/components/`, `src/modules/`, `src/pages/` |
| CI scanner | `scripts/enforce-service-layer.js` | `fetch(`, `axios`, direct `request()` in UI; any backendApi import in UI |
| Build chain | `package.json` `"build"` script | `npm run enforce && vite build` |
| GitHub Actions | `.github/workflows/enforce.yml` | Runs on push/PR to main/develop |
| Pre-commit hook | `.husky/pre-commit` | `npm run enforce` |