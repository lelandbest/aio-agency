/**
 * Integration Configuration Database
 * Defines all available integrations with their metadata and required fields
 */

export const INTEGRATION_CATEGORIES = {
  AUTOMATION: 'automation',
  CALENDAR: 'calendar',
  EMAIL: 'email',
  LLMS: 'llms',
  SMS: 'sms',
  TRACKING: 'tracking',
};

export const integrationConfigs = {
  // AUTOMATION CATEGORY
  automation: {
    id: 'automation',
    category: INTEGRATION_CATEGORIES.AUTOMATION,
    name: 'Automation',
    description: 'Automation workflows and integrations',
    providers: [
      {
        id: 'zapier',
        name: 'Zapier',
        icon: 'zapier',
        description: 'Automate your work with Zapier',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'webhookUrl', label: 'Webhook URL', type: 'text', required: false },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/zapier.svg',
      },
      {
        id: 'make',
        name: 'Make (Integromat)',
        icon: 'make',
        description: 'Visual integration and automation platform',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'teamId', label: 'Team ID', type: 'text', required: false },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/make-2.svg',
      },
    ],
  },

  // CALENDAR CATEGORY
  calendar: {
    id: 'calendar',
    category: INTEGRATION_CATEGORIES.CALENDAR,
    name: 'Calendar',
    description: 'Calendar integrations and sync',
    providers: [
      {
        id: 'google_calendar',
        name: 'Google Calendar',
        icon: 'google',
        description: 'Sync and manage Google Calendar events',
        fields: [
          { name: 'clientId', label: 'Client ID', type: 'text', required: true },
          { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
          { name: 'refreshToken', label: 'Refresh Token', type: 'password', required: false },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/google-calendar-icon.svg',
      },
      {
        id: 'ms_365',
        name: 'Microsoft 365 Calendar',
        icon: 'microsoft',
        description: 'Sync and manage Microsoft 365 calendar events',
        fields: [
          { name: 'clientId', label: 'Client ID', type: 'text', required: true },
          { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
          { name: 'tenantId', label: 'Tenant ID', type: 'text', required: true },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/microsoft-office-13.svg',
      },
    ],
  },

  // EMAIL CATEGORY
  email: {
    id: 'email',
    category: INTEGRATION_CATEGORIES.EMAIL,
    name: 'Email',
    description: 'Email service providers',
    providers: [
      {
        id: 'aws_ses',
        name: 'AWS SES',
        icon: 'aws',
        description: 'Amazon SES for transactional email',
        fields: [
          { name: 'accessKeyId', label: 'Access Key ID', type: 'text', required: true },
          { name: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true },
          { name: 'region', label: 'AWS Region', type: 'text', required: true, default: 'us-east-1' },
          { name: 'fromEmail', label: 'From Email Address', type: 'email', required: true },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/aws-2.svg',
      },
      {
        id: 'sendgrid',
        name: 'SendGrid',
        icon: 'sendgrid',
        description: 'SendGrid email delivery platform',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'fromEmail', label: 'From Email Address', type: 'email', required: true },
          { name: 'fromName', label: 'From Name', type: 'text', required: false },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/sendgrid.svg',
      },
      {
        id: 'mailgun',
        name: 'Mailgun',
        icon: 'mailgun',
        description: 'Mailgun email delivery service',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'domain', label: 'Domain', type: 'text', required: true },
          { name: 'fromEmail', label: 'From Email Address', type: 'email', required: true },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/mailgun-1.svg',
      },
      {
        id: 'smtp',
        name: 'SMTP',
        icon: 'email',
        description: 'Generic SMTP server configuration',
        fields: [
          { name: 'host', label: 'SMTP Host', type: 'text', required: true },
          { name: 'port', label: 'Port', type: 'number', required: true, default: 587 },
          { name: 'username', label: 'Username', type: 'text', required: true },
          { name: 'password', label: 'Password', type: 'password', required: true },
          { name: 'fromEmail', label: 'From Email Address', type: 'email', required: true },
          { name: 'useTls', label: 'Use TLS', type: 'checkbox', required: false, default: true },
        ],
        logo: null,
      },
    ],
  },

  // LLMs CATEGORY
  llms: {
    id: 'llms',
    category: INTEGRATION_CATEGORIES.LLMS,
    name: 'LLMs',
    description: 'Language Model integrations',
    providers: [
      {
        id: 'openai',
        name: 'OpenAI',
        icon: 'openai',
        description: 'GPT-4, GPT-3.5, and other OpenAI models',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'model', label: 'Model', type: 'text', required: false, default: 'gpt-4' },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/openai-2.svg',
      },
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        icon: 'anthropic',
        description: 'Claude language models by Anthropic',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'model', label: 'Model', type: 'text', required: false, default: 'claude-3-opus' },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/anthropic.svg',
      },
      {
        id: 'google_ai',
        name: 'Google AI (Gemini)',
        icon: 'google',
        description: 'Google Gemini and other Google AI models',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'model', label: 'Model', type: 'text', required: false, default: 'gemini-pro' },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/google-2015.svg',
      },
      {
        id: 'cohere',
        name: 'Cohere',
        icon: 'cohere',
        description: 'Cohere language models and API',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'model', label: 'Model', type: 'text', required: false, default: 'command' },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/cohere.svg',
      },
    ],
  },

  // SMS CATEGORY
  sms: {
    id: 'sms',
    category: INTEGRATION_CATEGORIES.SMS,
    name: 'SMS',
    description: 'SMS and messaging services',
    providers: [
      {
        id: 'twilio',
        name: 'Twilio',
        icon: 'twilio',
        description: 'Twilio SMS, Voice, and messaging',
        fields: [
          { name: 'accountSid', label: 'Account SID', type: 'text', required: true },
          { name: 'authToken', label: 'Auth Token', type: 'password', required: true },
          { name: 'phoneNumber', label: 'From Phone Number', type: 'tel', required: true },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/twilio-2.svg',
      },
      {
        id: 'plivo',
        name: 'Plivo',
        icon: 'plivo',
        description: 'Plivo SMS and voice services',
        fields: [
          { name: 'authId', label: 'Auth ID', type: 'text', required: true },
          { name: 'authToken', label: 'Auth Token', type: 'password', required: true },
          { name: 'sourceNumber', label: 'Source Number', type: 'tel', required: true },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/plivo.svg',
      },
      {
        id: 'sms_everyone',
        name: 'SMS Everyone',
        icon: 'sms',
        description: 'SMS Everyone messaging platform',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'senderId', label: 'Sender ID', type: 'text', required: true },
        ],
        logo: null,
      },
    ],
  },

  // TRACKING CATEGORY
  tracking: {
    id: 'tracking',
    category: INTEGRATION_CATEGORIES.TRACKING,
    name: 'Tracking & Analytics',
    description: 'Tracking pixels and analytics services',
    providers: [
      {
        id: 'fb_pixel',
        name: 'Facebook Conversion Pixel',
        icon: 'facebook',
        description: 'Facebook conversion tracking pixel',
        fields: [
          { name: 'pixelId', label: 'Pixel ID', type: 'text', required: true },
          { name: 'accessToken', label: 'Access Token', type: 'password', required: false },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/facebook-3.svg',
      },
      {
        id: 'google_analytics',
        name: 'Google Analytics',
        icon: 'google',
        description: 'Google Analytics tracking and reporting',
        fields: [
          { name: 'measurementId', label: 'Measurement ID', type: 'text', required: true },
          { name: 'apiSecret', label: 'API Secret', type: 'password', required: false },
          { name: 'propertyId', label: 'Property ID', type: 'text', required: false },
        ],
        logo: 'https://cdn.worldvectorlogo.com/logos/google-analytics.svg',
      },
    ],
  },
};

/**
 * Get all providers for a category
 */
export const getProvidersByCategory = (category) => {
  const config = integrationConfigs[category];
  return config ? config.providers : [];
};

/**
 * Get a specific provider config
 */
export const getProviderConfig = (providerId) => {
  for (const category in integrationConfigs) {
    const providers = integrationConfigs[category].providers;
    const provider = providers.find((p) => p.id === providerId);
    if (provider) return provider;
  }
  return null;
};

/**
 * Get all categories
 */
export const getAllCategories = () => {
  return Object.values(integrationConfigs).map((config) => ({
    id: config.id,
    name: config.name,
    description: config.description,
    providerCount: config.providers.length,
  }));
};
