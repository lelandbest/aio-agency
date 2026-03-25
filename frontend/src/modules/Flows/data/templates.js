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
  }
];

export const categories = ['All', 'AI Agents', 'CRM', 'Messaging', 'Automation'];
