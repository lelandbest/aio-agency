/**
 * LOCKED: AI Provider Unified Architecture - Phase 1 & 2
 * Verified Stable: March 25, 2026
 * DO NOT MODIFY SCHEMA OR STATS LOGIC WITHOUT OPERATOR APPROVAL
 */
/**
 * Integration Configuration Database
 * Defines all available integrations with their metadata and required fields
 */

export const INTEGRATION_CATEGORIES = {
  AUTOMATION: 'automation',
  EMAIL: 'email',
  CALENDAR: 'calendar',
  VIDEO_CONFERENCING: 'video-conferencing',
  LLMS: 'llms',
  SMS: 'sms',
  TRACKING: 'tracking',
  DATA_STORES: 'data-stores',
  PAYMENTS: 'payments',
  MEDIA: 'media',
  PROPOSALS: 'proposals',
  SOCIAL_NETWORKS: 'social-networks',
};

export const integrationConfigs = {
  [INTEGRATION_CATEGORIES.AUTOMATION]: {
    id: INTEGRATION_CATEGORIES.AUTOMATION,
    name: 'Automation',
    icon: 'zap',
    description: 'Workflow automation and webhook platforms.',
    providers: [
      {
        id: 'n8n',
        name: 'n8n',
        icon: 'n8n',
        description: 'Self-hosted workflow automation tool.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'n8n Instance' },
          { name: 'baseUrl', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://n8n.your-instance.com' },
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
        ],
        config: { mode: 'webhook' },
        logo: 'https://cdn.worldvectorlogo.com/logos/n8n.svg',
      },
      {
        id: 'boostspace',
        name: 'Boost.Space',
        icon: 'zap',
        description: 'Boost.Space orchestration and no-code workflow operations.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Boost.Space' },
          { name: 'baseUrl', label: 'Base URL', type: 'text', required: true, placeholder: 'https://api.boost.space' },
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
        ],
        logo: null,
      },
      {
        id: 'make',
        name: 'Make.com',
        icon: 'make',
        description: 'Visual automation platform (formerly Integromat).',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Make.com' },
          { name: 'baseUrl', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://hook.make.com/...' },
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
        ],
        logo: null,
      },
      {
        id: 'zapier',
        name: 'Zapier',
        icon: 'zapier',
        description: 'Development hold. Keep available for later workspace activation.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Zapier' },
          { name: 'baseUrl', label: 'Webhook URL', type: 'text', required: true },
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/zapier-1.svg',
      },
      {
        id: 'activepieces',
        name: 'Active Pieces',
        icon: 'zap',
        description: 'Open source automation flows with piece-based connectors.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Active Pieces' },
          { name: 'baseUrl', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://activepieces.your-instance.com' },
          { name: 'apiKey', label: 'API Key', type: 'password' },
        ],
        logo: null,
      },
      {
        id: 'latenode',
        name: 'Latenode',
        icon: 'zap',
        description: 'Visual workflow automation with hosted and self-managed execution.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Latenode' },
          { name: 'baseUrl', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://app.latenode.com' },
          { name: 'apiKey', label: 'API Key', type: 'password' },
        ],
        logo: null,
      },
      {
        id: 'pabbly',
        name: 'Pabbly Connect',
        icon: 'zap',
        description: 'Development hold. Keep available for later workspace activation.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Pabbly Connect' },
          { name: 'baseUrl', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://connect.pabbly.com' },
          { name: 'apiKey', label: 'API Key', type: 'password' },
        ],
        logo: null,
      },
    ]
  },

  [INTEGRATION_CATEGORIES.EMAIL]: {
    id: INTEGRATION_CATEGORIES.EMAIL,
    name: 'Managed Mailboxes',
    icon: 'mail',
    description: 'Email accounts and synchronization sources.',
    providers: [
      {
        id: 'gmail',
        name: 'Gmail',
        icon: 'gmail',
        description: 'Google Workspace and personal Gmail accounts.',
        fields: [],
        oauth: true,
        logo: 'https://cdn.worldvectorlogo.com/logos/gmail-icon.svg',
      },
      {
        id: 'outlook',
        name: 'Outlook / Office 365',
        icon: 'outlook',
        description: 'Microsoft 365 and Outlook.com mailboxes.',
        fields: [],
        oauth: true,
        logo: 'https://cdn.worldvectorlogo.com/logos/microsoft-outlook-1.svg',
      },
      {
        id: 'imap',
        name: 'Custom IMAP/SMTP',
        icon: 'mail',
        description: 'Connect any standard email hosting provider.',
        fields: [
          { name: 'incomingHost', label: 'IMAP Host', type: 'text', required: true },
          { name: 'incomingPort', label: 'IMAP Port', type: 'text', required: true, default: '993' },
          { name: 'outgoingHost', label: 'SMTP Host', type: 'text', required: true },
          { name: 'outgoingPort', label: 'SMTP Port', type: 'text', required: true, default: '465' },
          { name: 'username', label: 'Username', type: 'text', required: true },
          { name: 'password', label: 'Password', type: 'password', required: true },
        ],
        logo: null,
      },
      {
        id: 'reoon-email-verification',
        name: 'Reoon Email Verification',
        icon: 'shield-check',
        providerType: 'email-verification',
        managedBy: 'email-verifier',
        subtypeLabel: 'Email Verification Provider',
        description: 'Verify contact email deliverability inside CRM and flows using Reoon.',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          {
            name: 'defaultMode',
            label: 'Default Mode',
            type: 'select',
            required: true,
            default: 'quick',
            options: ['quick', 'power']
          },
          {
            name: 'autoVerifyContacts',
            label: 'Auto-verify contacts',
            type: 'checkbox',
            default: true
          }
        ],
        logo: null,
      },
    ]
  },

  [INTEGRATION_CATEGORIES.CALENDAR]: {
    id: INTEGRATION_CATEGORIES.CALENDAR,
    name: 'Calendar Sources',
    icon: 'calendar',
    description: 'External calendars and availability feeds.',
    providers: [
      {
        id: 'google-calendar',
        name: 'Google Calendar',
        icon: 'calendar',
        description: 'Sync events and availability with Google.',
        fields: [],
        oauth: true,
        logo: 'https://cdn.worldvectorlogo.com/logos/google-calendar-6.svg',
      },
      {
        id: 'outlook-calendar',
        name: 'Outlook Calendar',
        icon: 'calendar',
        description: 'Sync events and availability with Microsoft 365.',
        fields: [],
        oauth: true,
        logo: 'https://cdn.worldvectorlogo.com/logos/microsoft-outlook-1.svg',
      },
    ]
  },

  [INTEGRATION_CATEGORIES.VIDEO_CONFERENCING]: {
    id: INTEGRATION_CATEGORIES.VIDEO_CONFERENCING,
    name: 'Video Conferencing',
    icon: 'video',
    description: 'Meeting platforms, room links, and conference ingestion sources.',
    providers: [
      {
        id: 'zoom-api',
        name: 'Zoom',
        icon: 'zoom-api',
        description: 'Zoom API-backed meeting and recording connectivity.',
        fields: [
          { name: 'accountId', label: 'Account ID', type: 'text', required: true },
          { name: 'clientId', label: 'Client ID', type: 'text', required: true },
          { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
          { name: 'userId', label: 'User ID', type: 'text' },
        ],
        logo: null,
      },
      {
        id: 'google-meet-oauth',
        name: 'Google Meet',
        icon: 'google-meet-oauth',
        description: 'Google OAuth-backed meeting connectivity and calendar-linked Meet sessions.',
        fields: [],
        oauth: true,
        logo: null,
      },
      {
        id: 'jitsi-stub',
        name: 'Jitsi',
        icon: 'jitsi-stub',
        description: 'Placeholder only for now. Live backend connectivity is not implemented yet.',
        fields: [
          { name: 'serverUrl', label: 'Server URL', type: 'text' },
          { name: 'roomPrefix', label: 'Room Prefix', type: 'text' },
          { name: 'apiKey', label: 'API Key', type: 'password' },
        ],
        logo: null,
      },
    ]
  },

  [INTEGRATION_CATEGORIES.LLMS]: {
    id: INTEGRATION_CATEGORIES.LLMS,
    name: 'LLMs',
    icon: 'bot',
    description: 'Language Model and AI runtime integrations.',
    providers: [
      {
        id: 'ollama',
        name: 'Ollama',
        icon: 'ollama',
        description: 'Connect a local or networked Ollama runtime.',
        fields: [
          { name: 'baseUrl', label: 'Base URL', type: 'text', required: true, default: 'http://192.168.4.28:11434', placeholder: 'http://192.168.4.28:11434' },
          { name: 'apiKey', label: 'API Key', type: 'password' },
          { name: 'username', label: 'Username', type: 'text' },
          { name: 'password', label: 'Password', type: 'password' },
          { name: 'model', label: 'Model', type: 'text', required: true, default: 'minimax-m2.5:cloud' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'systemGuardrails', label: 'System Guardrails', type: 'textarea', placeholder: 'Persistent instructions applied to all requests.' },
          { name: 'taskGuardrails', label: 'Task Guardrails', type: 'textarea', placeholder: 'Task-level guidance applied alongside system guardrails.' },
        ],
        logo: null,
      },
      {
        id: 'openai',
        name: 'OpenAI',
        icon: 'openai',
        description: 'GPT-4, GPT-3.5, and other OpenAI models',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'baseUrl', label: 'Base URL', type: 'text', default: 'https://api.openai.com' },
          { name: 'model', label: 'Model', type: 'text', default: 'gpt-4.1-mini' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'systemGuardrails', label: 'System Guardrails', type: 'textarea' },
          { name: 'taskGuardrails', label: 'Task Guardrails', type: 'textarea' },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/openai-2.svg',
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: 'openrouter',
        description: 'Route AI traffic through OpenRouter-managed models.',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'baseUrl', label: 'Base URL', type: 'text', default: 'https://openrouter.ai/api' },
          { name: 'model', label: 'Model', type: 'text', default: 'openai/gpt-4.1-mini' },
          { name: 'siteUrl', label: 'Site URL', type: 'text' },
          { name: 'appName', label: 'App Name', type: 'text', default: 'AIO CRM' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'systemGuardrails', label: 'System Guardrails', type: 'textarea' },
          { name: 'taskGuardrails', label: 'Task Guardrails', type: 'textarea' },
        ],
        logo: null,
      },
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        icon: 'anthropic',
        description: 'Claude language models by Anthropic',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'baseUrl', label: 'Base URL', type: 'text', default: 'https://api.anthropic.com' },
          { name: 'model', label: 'Model', type: 'text', default: 'claude-sonnet-4-20250514' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'systemGuardrails', label: 'System Guardrails', type: 'textarea' },
          { name: 'taskGuardrails', label: 'Task Guardrails', type: 'textarea' },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/anthropic.svg',
      },
      {
        id: 'google-ai',
        name: 'Google AI (Gemini)',
        icon: 'google',
        description: 'Google Gemini and other Google AI models',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'baseUrl', label: 'Base URL', type: 'text', default: 'https://generativelanguage.googleapis.com' },
          { name: 'model', label: 'Model', type: 'text', default: 'gemini-2.5-flash' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'systemGuardrails', label: 'System Guardrails', type: 'textarea' },
          { name: 'taskGuardrails', label: 'Task Guardrails', type: 'textarea' },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/google-2015.svg',
      },
      {
        id: 'perplexity',
        name: 'Perplexity',
        icon: 'perplexity',
        description: 'Perplexity language models and API',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'baseUrl', label: 'Base URL', type: 'text', default: 'https://api.perplexity.ai' },
          { name: 'model', label: 'Model', type: 'text', default: 'sonar' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'systemGuardrails', label: 'System Guardrails', type: 'textarea' },
          { name: 'taskGuardrails', label: 'Task Guardrails', type: 'textarea' },
        ],
        logo: null,
      },
    ],
  },

  [INTEGRATION_CATEGORIES.SMS]: {
    id: INTEGRATION_CATEGORIES.SMS,
    name: 'SMS',
    icon: 'message-square',
    description: 'SMS and messaging integrations',
    providers: [
      {
        id: 'placeholder-sms',
        name: 'SMS Placeholder',
        icon: 'message-square',
        description: 'SMS functionality is coming soon.',
        fields: [],
        logo: null,
      },
    ],
  },

  [INTEGRATION_CATEGORIES.TRACKING]: {
    id: INTEGRATION_CATEGORIES.TRACKING,
    name: 'Tracking & Analytics',
    icon: 'activity',
    description: 'External event tracking and performance systems.',
    providers: [
      {
        id: 'googleAnalytics',
        name: 'Google Analytics',
        icon: 'activity',
        description: 'Measurement and event tracking through Google Analytics.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Google Analytics' },
          { name: 'measurementId', label: 'Measurement ID', type: 'text', required: true },
          { name: 'apiSecret', label: 'API Secret', type: 'password' },
        ],
        logo: null,
      },
      {
        id: 'facebookPixel',
        name: 'Facebook Pixel',
        icon: 'activity',
        description: 'Meta Pixel event tracking and attribution.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Facebook Pixel' },
          { name: 'pixelId', label: 'Pixel ID', type: 'text', required: true },
          { name: 'accessToken', label: 'Access Token', type: 'password' },
        ],
        logo: null,
      },
    ],
  },

  [INTEGRATION_CATEGORIES.DATA_STORES]: {
    id: INTEGRATION_CATEGORIES.DATA_STORES,
    name: 'Data Stores',
    icon: 'table',
    description: 'Structured external data sources for records and row operations.',
    providers: [
      {
        id: 'googleSheets',
        name: 'Google Sheets',
        icon: 'table',
        description: 'Read and write worksheet rows through the Google Sheets API.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Google Sheets' },
          { name: 'baseUrl', label: 'Base URL', type: 'text', required: true, default: 'https://sheets.googleapis.com/v4/spreadsheets' },
          { name: 'apiKey', label: 'API Key', type: 'password' },
          { name: 'accessToken', label: 'Access Token', type: 'password' },
          { name: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text', required: true },
          { name: 'sheetName', label: 'Sheet Name', type: 'text', required: true, default: 'Sheet1' },
          { name: 'rangeA1', label: 'Range A1', type: 'text', default: 'Sheet1!A:ZZ' },
        ],
        logo: null,
      },
      {
        id: 'airtable',
        name: 'Airtable',
        icon: 'table',
        description: 'Read and write Airtable records via the REST API.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Airtable' },
          { name: 'baseUrl', label: 'Base URL', type: 'text', required: true, default: 'https://api.airtable.com/v0' },
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'baseId', label: 'Base ID', type: 'text', required: true },
          { name: 'tableId', label: 'Table ID', type: 'text', required: true },
        ],
        logo: null,
      },
      {
        id: 'aiTable',
        name: 'AI Table',
        icon: 'table',
        description: 'Airtable-compatible table endpoint for structured records.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'AI Table' },
          { name: 'baseUrl', label: 'Base URL', type: 'text', required: true },
          { name: 'apiKey', label: 'API Key', type: 'password' },
          { name: 'baseId', label: 'Base ID', type: 'text', required: true },
          { name: 'tableId', label: 'Table ID', type: 'text', required: true },
        ],
        logo: null,
      },
    ],
  },

  [INTEGRATION_CATEGORIES.PAYMENTS]: {
    id: INTEGRATION_CATEGORIES.PAYMENTS,
    name: 'Payments',
    icon: 'credit-card',
    description: 'Online payment processing for internet businesses.',
    providers: [
      {
        id: 'stripe',
        name: 'Stripe',
        icon: 'credit-card',
        description: 'Online payment processing for internet businesses.',
        fields: [
          { name: 'label', label: 'Provider Label', type: 'text', required: true, default: 'Stripe' },
          { name: 'publishableKey', label: 'Publishable Key', type: 'text', required: true },
          { name: 'secretKey', label: 'Secret Key', type: 'password', required: true },
          { 
            name: 'mode', 
            label: 'Mode', 
            type: 'select', 
            required: true, 
            default: 'test',
            options: ['test', 'live']
          },
          { 
            name: 'currency', 
            label: 'Default Currency', 
            type: 'select', 
            required: true, 
            default: 'usd',
            options: ['usd', 'eur', 'gbp', 'cad', 'aud']
          },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/stripe-2.svg',
      },
      {
        id: 'paypal',
        name: 'PayPal',
        icon: 'credit-card',
        description: 'Digital payments and commerce platform.',
        fields: [
          { name: 'label', label: 'Provider Label', type: 'text', required: true, default: 'PayPal' },
          { name: 'clientId', label: 'Client ID', type: 'text', required: true },
          { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
          { 
            name: 'mode', 
            label: 'Mode', 
            type: 'select', 
            required: true, 
            default: 'sandbox',
            options: ['sandbox', 'live']
          },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/paypal-3.svg',
      },
    ]
  },

  [INTEGRATION_CATEGORIES.MEDIA]: {
    id: INTEGRATION_CATEGORIES.MEDIA,
    name: 'Media & Transcription',
    icon: 'mic',
    description: 'Transcription, voice-render, and speech services for media operations.',
    providers: [
      {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        icon: 'elevenlabs',
        description: 'Unified voice synthesis (TTS) and transcription (STT) through ElevenLabs. Powers Charlie voice, media narration, and audio transcription.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'ElevenLabs' },
          { name: 'baseUrl', label: 'Base URL', type: 'text', default: 'https://api.elevenlabs.io' },
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'voice', label: 'Default Voice', type: 'select', default: '21m00Tcm4TlvDq8ikWAM', options: [
            { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel' },
            { value: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi' },
            { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella' },
            { value: 'ErXwobaYiN019PkySvjV', label: 'Antoni' },
            { value: 'MF3mGyEYCl7XYWbV9V6O', label: 'Elli' },
            { value: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh' },
            { value: 'VR6AewLTigWG4xSOukaG', label: 'Arnold' },
            { value: 'pNInz6obpgDQGcFmaJgB', label: 'Adam' },
            { value: 'yoZ06aMxZJJ28mfd3POQ', label: 'Sam' },
          ]},
          { name: 'voiceId', label: 'Custom Voice ID', type: 'text' },
          { name: 'charlieVoice', label: 'Charlie Voice', type: 'select', default: '21m00Tcm4TlvDq8ikWAM', options: [
            { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel' },
            { value: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi' },
            { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella' },
            { value: 'ErXwobaYiN019PkySvjV', label: 'Antoni' },
            { value: 'MF3mGyEYCl7XYWbV9V6O', label: 'Elli' },
            { value: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh' },
            { value: 'VR6AewLTigWG4xSOukaG', label: 'Arnold' },
            { value: 'pNInz6obpgDQGcFmaJgB', label: 'Adam' },
            { value: 'yoZ06aMxZJJ28mfd3POQ', label: 'Sam' },
          ]},
          { name: 'futureVoicePool', label: 'Future Voice Pool Notes', type: 'textarea', default: 'Reserve future multi-agent voice assignments here.' },
        ],
        logo: null,
      },
    ]
  },

  [INTEGRATION_CATEGORIES.PROPOSALS]: {
    id: INTEGRATION_CATEGORIES.PROPOSALS,
    name: 'Proposals & Invoices',
    icon: 'file-text',
    description: 'Proposal, estimate, and invoicing integrations.',
    providers: [
      {
        id: 'waveapps',
        name: 'WaveApps',
        icon: 'file-text',
        description: 'Ready for future estimate/proposal/invoice API access. No workflow features enabled yet.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'WaveApps' },
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'apiSecret', label: 'API Secret', type: 'password', required: true },
        ],
        logo: null,
      },
    ]
  },
  [INTEGRATION_CATEGORIES.SOCIAL_NETWORKS]: {
    id: INTEGRATION_CATEGORIES.SOCIAL_NETWORKS,
    name: 'Social Networks',
    icon: 'share',
    description: 'Connect destinations for asset distribution and publishing.',
    providers: [
      {
        id: 'youtube',
        name: 'YouTube',
        icon: 'youtube',
        description: 'Publish videos to YouTube. OAuth connection required.',
        fields: [
          { name: 'channelId', label: 'Channel ID', type: 'text', required: false, placeholder: 'UC...' },
          { name: 'privacyDefault', label: 'Default Privacy', type: 'select', options: ['private', 'unlisted', 'public'], default: 'private' },
          { name: 'category', label: 'Default Category', type: 'text', required: false, placeholder: 'Science & Technology' },
        ],
        status: 'needsConfig',
        logo: null,
      },
      {
        id: 'facebook',
        name: 'Facebook',
        icon: 'facebook',
        description: 'Publish posts and media to Facebook Pages. OAuth connection required.',
        fields: [
          { name: 'pageId', label: 'Page ID', type: 'text', required: false, placeholder: 'Page ID or URL' },
        ],
        status: 'needsConfig',
        logo: null,
      },
      {
        id: 'linkedin',
        name: 'LinkedIn',
        icon: 'linkedin',
        description: 'Publish posts to LinkedIn profiles and organizations. OAuth connection required.',
        fields: [
          { name: 'profileType', label: 'Profile Type', type: 'select', options: ['personal', 'organization'], default: 'personal' },
          { name: 'organizationId', label: 'Organization URN', type: 'text', required: false, placeholder: 'urn:li:organization:...' },
        ],
        status: 'needsConfig',
        logo: null,
      },
      {
        id: 'tiktok',
        name: 'TikTok',
        icon: 'tiktok',
        description: 'Publish videos to TikTok. OAuth connection required.',
        fields: [
          { name: 'accountId', label: 'Account ID', type: 'text', required: false, placeholder: 'TikTok account identifier' },
          { name: 'privacyDefault', label: 'Default Privacy', type: 'select', options: ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'PUBLIC_TO_EVERYONE'], default: 'SELF_ONLY' },
        ],
        status: 'needsConfig',
        logo: null,
      },
      {
        id: 'x',
        name: 'X',
        icon: 'twitter',
        description: 'Publish posts to X (formerly Twitter). API authentication required.',
        fields: [
          { name: 'handle', label: 'Handle', type: 'text', required: false, placeholder: '@handle' },
        ],
        status: 'needsConfig',
        logo: null,
      },
      {
        id: 'custom-rtmp',
        name: 'Custom RTMP',
        icon: 'broadcast',
        description: 'Custom RTMP destinations for encoder/ffmpeg-based delivery. Supports future Relay distribution workflows.',
        fields: [
          { name: 'label', label: 'Destination Label', type: 'text', required: true, placeholder: 'e.g. Main Stream, Backup' },
          { name: 'rtmpUrl', label: 'RTMP URL', type: 'text', required: true, placeholder: 'rtmp://live.example.com/app' },
          { name: 'streamKey', label: 'Stream Key', type: 'password', required: true, placeholder: 'sk-...' },
          { name: 'backupUrl', label: 'Backup URL (optional)', type: 'text', required: false, placeholder: 'rtmp://backup.example.com/app' },
          { name: 'notes', label: 'Notes', type: 'textarea', required: false, placeholder: 'Purpose, schedule, or operational notes.' },
        ],
        status: 'needsConfig',
        logo: null,
      },
      {
        id: 'instagram',
        name: 'Instagram',
        icon: 'instagram',
        description: 'Publish to Instagram. Not yet active.',
        fields: [],
        status: 'notConnected',
        stub: true,
        logo: null,
      },
      {
        id: 'pinterest',
        name: 'Pinterest',
        icon: 'pinterest',
        description: 'Publish to Pinterest. Not yet active.',
        fields: [],
        status: 'notConnected',
        stub: true,
        logo: null,
      },
    ]
  },
};

export const getProviderConfig = (providerId) => {
  for (const category of Object.values(integrationConfigs)) {
    if (category.providers) {
      const provider = category.providers.find((p) => p.id === providerId);
      if (provider) return provider;
    }
  }
  return null;
};

export const getProvidersByCategory = (categoryId) => {
  const category = integrationConfigs[categoryId];
  if (!category) return [];
  if (category.providers) return category.providers;
  return [];
};

export const getAllCategories = () => {
  return Object.values(integrationConfigs).map((config) => ({
    id: config.id,
    name: config.name,
    description: config.description,
    providerCount: config.providers?.length || 1,
  })).sort((a, b) => a.name.localeCompare(b.name));
};

export const normalizeAiField = (name) => {
  return String(name || '').replace(/[-_]+([a-zA-Z0-9])/g, (_, character) => character.toUpperCase());
};
