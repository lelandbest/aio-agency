/**
 * Prebuilt Flow Templates
 * Organized by category with predefined nodes, edges, and variable placeholders
 */

export const templates = [
  {
    id: 'ai-lead-responder',
    name: 'AI Lead Responder',
    description: 'Instantly qualifies leads via SMS and routes to CRM based on intent.',
    category: 'AI Agents',
    iconName: 'Bot',
    complexity: 'Advanced',
    nodes: [
      { id: 'trigger', type: 'trigger', data: { label: 'New Lead', iconName: 'User' }, position: { x: 100, y: 200 } },
      { id: 'ai-qualifier', type: 'action', data: { label: 'AI Qualifier', iconName: 'Bot' }, position: { x: 400, y: 200 } },
      { id: 'crm-update', type: 'action', data: { label: 'Update CRM', iconName: 'Database' }, position: { x: 700, y: 200 } }
    ],
    edges: [
      { id: 'e1-2', source: 'trigger', target: 'ai-qualifier', animated: true },
      { id: 'e2-3', source: 'ai-qualifier', target: 'crm-update', animated: true }
    ],
    placeholders: ['{{agent_prompt}}', '{{contact_phone}}']
  },
  {
    id: 'abandoned-cart-sms',
    name: 'Abandoned Cart SMS',
    description: 'Recover lost sales by sending an automated SMS reminder.',
    category: 'Messaging',
    iconName: 'MessageSquare',
    complexity: 'Intermediate',
    nodes: [
      { id: 'trigger', type: 'webhook', data: { label: 'Cart Abandoned', iconName: 'Webhook' }, position: { x: 100, y: 200 } },
      { id: 'wait', type: 'logic', data: { label: 'Wait 1 Hour', iconName: 'Clock' }, position: { x: 400, y: 200 } },
      { id: 'sms', type: 'action', data: { label: 'Send SMS', iconName: 'MessageSquare' }, position: { x: 700, y: 200 } }
    ],
    edges: [
      { id: 'e1-2', source: 'trigger', target: 'wait', animated: true },
      { id: 'e2-3', source: 'wait', target: 'sms', animated: true }
    ],
    placeholders: ['{{customer_name}}', '{{checkout_url}}']
  },
  {
    id: 'webhook-to-slack',
    name: 'Webhook to Internal Alert',
    description: 'Routes incoming webhook data to internal messaging channels.',
    category: 'Automation',
    iconName: 'Zap',
    complexity: 'Basic',
    nodes: [
      { id: 'trigger', type: 'webhook', data: { label: 'Incoming Hook', iconName: 'Webhook' }, position: { x: 100, y: 200 } },
      { id: 'alert', type: 'action', data: { label: 'Send Alert', iconName: 'Bell' }, position: { x: 400, y: 200 } }
    ],
    edges: [
      { id: 'e1-2', source: 'trigger', target: 'alert', animated: true }
    ],
    placeholders: ['{{webhook_url}}', '{{alert_channel}}']
  },
  {
    id: 'podcast-pipeline',
    name: 'Media Pipeline',
    description: 'Generate, render, and publish media assets including scripts, audio, images, and video.',
    category: 'Media',
    iconName: 'Headphones',
    complexity: 'Advanced',
    nodes: [
      {
        id: 'podcast-trigger',
        type: 'trigger',
        data: {
          label: 'Manual Trigger',
          iconName: 'Play',
          templateId: 'manual-trigger',
          config: { event: 'manual' },
        },
        position: { x: 80, y: 240 },
      },
      {
        id: 'podcast-script',
        type: 'action',
        data: {
          label: 'Generate Script',
          iconName: 'FileText',
          templateId: 'generate-script',
          config: {
            actionType: 'generate_script',
            topic: 'Product update',
            tone: 'Clear',
            length: '12 minutes',
            duration: '12 minutes',
            context: 'Media brief for a campaign-ready asset package.',
            inputs: {
              topic: 'Product update',
              tone: 'Clear',
              length: '12 minutes',
            },
            provider: 'stub-script',
          },
        },
        position: { x: 360, y: 240 },
      },
      {
        id: 'podcast-tts',
        type: 'action',
        data: {
          label: 'Text to Speech',
          iconName: 'Headphones',
          templateId: 'text-to-speech',
          config: {
            actionType: 'text_to_speech',
            text: '{{previous.artifact.script_text}}',
            voice: 'Rachel',
            style: 'Conversational',
            provider: 'elevenlabs_tts',
          },
        },
        position: { x: 660, y: 240 },
      },
      {
        id: 'podcast-thumbnail',
        type: 'action',
        data: {
          label: 'Generate Thumbnail',
          iconName: 'Image',
          templateId: 'generate-thumbnail',
          config: {
            actionType: 'generate_thumbnail',
            title: 'Product update',
            subtitle: 'Feature spotlight',
            image: 'Bold studio backdrop',
            prompt: 'Create a bold media thumbnail with strong contrast and clean title space.',
            provider: 'stub-render',
          },
        },
        position: { x: 960, y: 240 },
      },
      {
        id: 'podcast-video',
        type: 'action',
        data: {
          label: 'Generate Video',
          iconName: 'Image',
          templateId: 'generate-video',
          config: {
            actionType: 'generate_video',
            templateId: 'media-teaser-v1',
            outputTarget: 'media.library',
            script: 'Create a short teaser video for the product update asset package.',
            provider: 'stub-render',
          },
        },
        position: { x: 1260, y: 240 },
      },
      {
        id: 'podcast-publish',
        type: 'action',
        data: {
          label: 'Publish Asset',
          iconName: 'Send',
          templateId: 'publish-asset',
          config: {
            actionType: 'publish_asset',
            publishTarget: 'internal.media',
          },
        },
        position: { x: 1560, y: 240 },
      }
    ],
    edges: [
      { id: 'podcast-e1', source: 'podcast-trigger', target: 'podcast-script', animated: true },
      { id: 'podcast-e2', source: 'podcast-script', target: 'podcast-tts', animated: true },
      { id: 'podcast-e3', source: 'podcast-tts', target: 'podcast-thumbnail', animated: true },
      { id: 'podcast-e4', source: 'podcast-thumbnail', target: 'podcast-video', animated: true },
      { id: 'podcast-e5', source: 'podcast-video', target: 'podcast-publish', animated: true }
    ],
    placeholders: []
  }
];

export const categories = ['All', 'AI Agents', 'CRM', 'Messaging', 'Automation', 'Media'];
