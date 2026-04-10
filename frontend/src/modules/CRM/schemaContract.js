export const CRM_CONTACT_STATUSES = ['lead', 'prospect', 'customer', 'partner', 'inactive'];

export const CRM_CONTACT_SOURCES = ['manual', 'form', 'comms', 'import', 'system'];

export const CRM_MODEL_SECTIONS = [
  {
    id: 'person',
    title: 'Person / Contact',
    description: 'Primary record of relationship identity and direct operator ownership.',
    fields: [
      'displayName',
      'firstName',
      'lastName',
      'phones[]',
      'emails[]',
      'companyId',
      'tags[]',
      'source',
      'owner',
      'status',
      'notes',
      'customFields{}',
    ],
  },
  {
    id: 'organization',
    title: 'Organization / Company',
    description: 'Shared account context that multiple people can anchor to.',
    fields: [
      'name',
      'website',
      'domain',
      'phones[]',
      'emails[]',
      'address{}',
      'tags[]',
      'owner',
      'linkedContacts[]',
    ],
  },
  {
    id: 'activity',
    title: 'Activity Timeline',
    description: 'Unified operational log for notes, system events, and future workflow motion.',
    fields: [
      'activityType',
      'title',
      'description',
      'metadata{}',
      'actor',
      'createdAt',
    ],
  },
  {
    id: 'comms',
    title: 'Comms Linkage',
    description: 'Attach canonical communications truth rather than duplicating it inside CRM.',
    fields: [
      'threadIds[]',
      'callSessionIds[]',
      'lastSmsAt',
      'lastCallAt',
      'threadSummary',
    ],
  },
  {
    id: 'operational',
    title: 'Operational State',
    description: 'Assignment, lifecycle, and pipeline belong on the entity but do not define it.',
    fields: [
      'owner',
      'assignee',
      'status',
      'pipelineStage',
      'followUpNeeded',
      'priority',
      'nextActionAt',
    ],
  },
  {
    id: 'intelligence',
    title: 'Future Intelligence Hooks',
    description: 'Reserved space for summaries, recency, health, and relationship signals.',
    fields: [
      'lastContactAt',
      'lastResponseAt',
      'relationshipHealth',
      'opportunitySignal',
      'priorityIndicator',
      'aiSummary',
    ],
  },
];

export const CRM_EMPTY_LANES = [
  {
    id: 'manual',
    title: 'Manual Entry',
    status: 'Live',
    description: 'Operators can establish the first canonical contact manually with a real record.',
  },
  {
    id: 'comms',
    title: 'Comms Attachment',
    status: 'Ready',
    description: 'SMS and call history should attach to real people only after a trusted contact exists.',
  },
  {
    id: 'ingest',
    title: 'Import / Intake',
    status: 'Deferred',
    description: 'No CSV or synthetic seed load is treated as CRM truth in this rebuild state.',
  },
];

export const CRM_WORKSPACE_ZONES = [
  {
    id: 'list',
    title: 'Relationship Index',
    description: 'Searchable list of real dossiers only. No placeholders, no speculative cards.',
  },
  {
    id: 'detail',
    title: 'Entity Command Surface',
    description: 'Identity, organization, comms linkage, and operational state share one dossier.',
  },
  {
    id: 'timeline',
    title: 'Activity / Timeline',
    description: 'A single zone for notes, comms events, workflow motion, and future AI summaries.',
  },
];

export const createContactDraft = () => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  owner: '',
  status: 'lead',
  source: 'manual',
  tagsText: '',
  notes: '',
});
