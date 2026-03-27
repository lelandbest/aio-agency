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
  LLMS: 'llms',
  SMS: 'sms',
  TRACKING: 'tracking',
  PAYMENTS: 'payments',
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
          { name: 'base_url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://n8n.your-instance.com' },
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
        ],
        config: { mode: 'webhook' },
        logo: 'https://cdn.worldvectorlogo.com/logos/n8n.svg',
      },
      {
        id: 'make',
        name: 'Make.com',
        icon: 'make',
        description: 'Visual automation platform (formerly Integromat).',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Make.com' },
          { name: 'base_url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://hook.make.com/...' },
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
        ],
        logo: null,
      },
      {
        id: 'zapier',
        name: 'Zapier',
        icon: 'zapier',
        description: 'Connect your apps and automate workflows.',
        fields: [
          { name: 'label', label: 'Connection Label', type: 'text', required: true, default: 'Zapier' },
          { name: 'base_url', label: 'Webhook URL', type: 'text', required: true },
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/zapier-1.svg',
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
          { name: 'imap_host', label: 'IMAP Host', type: 'text', required: true },
          { name: 'imap_port', label: 'IMAP Port', type: 'text', required: true, default: '993' },
          { name: 'smtp_host', label: 'SMTP Host', type: 'text', required: true },
          { name: 'smtp_port', label: 'SMTP Port', type: 'text', required: true, default: '465' },
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
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
          {
            name: 'default_mode',
            label: 'Default Mode',
            type: 'select',
            required: true,
            default: 'quick',
            options: ['quick', 'power']
          },
          {
            name: 'auto_verify_contacts',
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
      {
        id: 'calcom',
        name: 'Cal.com',
        icon: 'calendar',
        description: 'Open source scheduling infrastructure.',
        fields: [
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
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
          { name: 'base_url', label: 'Base URL', type: 'text', required: true, placeholder: 'http://192.168.4.28:11434' },
          { name: 'api_key', label: 'API Key', type: 'password' },
          { name: 'username', label: 'Username', type: 'text' },
          { name: 'password', label: 'Password', type: 'password' },
          { name: 'model', label: 'Model', type: 'text', required: true },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'system_guardrails', label: 'System Guardrails', type: 'textarea', placeholder: 'Persistent instructions applied to all requests.' },
          { name: 'task_guardrails', label: 'Task Guardrails', type: 'textarea', placeholder: 'Task-level guidance applied alongside system guardrails.' },
        ],
        logo: null,
      },
      {
        id: 'openai',
        name: 'OpenAI',
        icon: 'openai',
        description: 'GPT-4, GPT-3.5, and other OpenAI models',
        fields: [
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
          { name: 'base_url', label: 'Base URL', type: 'text', default: 'https://api.openai.com' },
          { name: 'model', label: 'Model', type: 'text', default: 'gpt-4.1-mini' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'system_guardrails', label: 'System Guardrails', type: 'textarea' },
          { name: 'task_guardrails', label: 'Task Guardrails', type: 'textarea' },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/openai-2.svg',
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: 'openrouter',
        description: 'Route AI traffic through OpenRouter-managed models.',
        fields: [
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
          { name: 'base_url', label: 'Base URL', type: 'text', default: 'https://openrouter.ai/api' },
          { name: 'model', label: 'Model', type: 'text', default: 'openai/gpt-4.1-mini' },
          { name: 'site_url', label: 'Site URL', type: 'text' },
          { name: 'app_name', label: 'App Name', type: 'text', default: 'AIO CRM' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'system_guardrails', label: 'System Guardrails', type: 'textarea' },
          { name: 'task_guardrails', label: 'Task Guardrails', type: 'textarea' },
        ],
        logo: null,
      },
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        icon: 'anthropic',
        description: 'Claude language models by Anthropic',
        fields: [
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
          { name: 'base_url', label: 'Base URL', type: 'text', default: 'https://api.anthropic.com' },
          { name: 'model', label: 'Model', type: 'text', default: 'claude-sonnet-4-20250514' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'system_guardrails', label: 'System Guardrails', type: 'textarea' },
          { name: 'task_guardrails', label: 'Task Guardrails', type: 'textarea' },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/anthropic.svg',
      },
      {
        id: 'google-ai',
        name: 'Google AI (Gemini)',
        icon: 'google',
        description: 'Google Gemini and other Google AI models',
        fields: [
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
          { name: 'base_url', label: 'Base URL', type: 'text', default: 'https://generativelanguage.googleapis.com' },
          { name: 'model', label: 'Model', type: 'text', default: 'gemini-2.5-flash' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'system_guardrails', label: 'System Guardrails', type: 'textarea' },
          { name: 'task_guardrails', label: 'Task Guardrails', type: 'textarea' },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/google-2015.svg',
      },
      {
        id: 'perplexity',
        name: 'Perplexity',
        icon: 'perplexity',
        description: 'Perplexity language models and API',
        fields: [
          { name: 'api_key', label: 'API Key', type: 'password', required: true },
          { name: 'base_url', label: 'Base URL', type: 'text', default: 'https://api.perplexity.ai' },
          { name: 'model', label: 'Model', type: 'text', default: 'sonar' },
          { name: 'temperature', label: 'Temperature', type: 'text', default: '0.2' },
          { name: 'system_guardrails', label: 'System Guardrails', type: 'textarea' },
          { name: 'task_guardrails', label: 'Task Guardrails', type: 'textarea' },
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
        id: 'placeholder-tracking',
        name: 'Tracking Placeholder',
        icon: 'activity',
        description: 'Tracking functionality is coming soon.',
        fields: [],
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
          { name: 'publishable_key', label: 'Publishable Key', type: 'text', required: true },
          { name: 'secret_key', label: 'Secret Key', type: 'password', required: true },
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
          { name: 'client_id', label: 'Client ID', type: 'text', required: true },
          { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
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

/**
 * Normalizes field names between frontend (camelCase) and backend (snake_case).
 * Handles: apiKey -> api_key, baseUrl -> base_url, 
 * systemGuardrails -> system_guardrails, taskGuardrails -> task_guardrails
 */
export const normalizeAiField = (name) => {
  const mapping = {
    'apiKey': 'api_key',
    'baseUrl': 'base_url',
    'systemGuardrails': 'system_guardrails',
    'taskGuardrails': 'task_guardrails',
    'system_guardrails': 'system_guardrails',
    'task_guardrails': 'task_guardrails',
    'base_url': 'base_url',
    'api_key': 'api_key'
  };
  return mapping[name] || name;
};
