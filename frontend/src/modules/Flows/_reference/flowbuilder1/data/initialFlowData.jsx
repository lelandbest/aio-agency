export const initialNodes = [
  {
    id: '1',
    type: 'trigger',
    position: { x: 250, y: 50 },
    data: {
      label: 'Form Submitted',
      category: 'Triggers',
      config: {
        event: 'form_submitted',
        conditions: 'Contact form on pricing page',
      },
    },
  },
  {
    id: '2',
    type: 'action',
    position: { x: 250, y: 200 },
    data: {
      label: 'Create Contact',
      category: 'CRM',
      config: {
        actionType: 'create_task',
        description: 'Add lead to CRM system',
      },
    },
  },
  {
    id: '3',
    type: 'logic',
    position: { x: 250, y: 350 },
    data: {
      label: 'Check Interest Level',
      category: 'Logic',
      config: {
        conditionType: 'if_else',
        rules: 'If interest = "High" then path A, else path B',
      },
    },
  },
  {
    id: '4',
    type: 'action',
    position: { x: 100, y: 500 },
    data: {
      label: 'Send Welcome Email',
      category: 'Messaging',
      config: {
        actionType: 'send_email',
        template: 'welcome',
        recipient: '{{contact.email}}',
        description: 'Send personalized welcome email to high-interest leads',
      },
    },
  },
  {
    id: '5',
    type: 'action',
    position: { x: 400, y: 500 },
    data: {
      label: 'Add to Nurture Campaign',
      category: 'CRM',
      config: {
        actionType: 'update_contact',
        description: 'Add contact to email nurture sequence',
      },
    },
  },
];

export const initialEdges = [
  {
    id: 'e1-2',
    source: '1',
    target: '2',
    type: 'smoothstep',
    animated: true,
  },
  {
    id: 'e2-3',
    source: '2',
    target: '3',
    type: 'smoothstep',
    animated: true,
  },
  {
    id: 'e3-4',
    source: '3',
    target: '4',
    type: 'smoothstep',
    animated: true,
    label: 'High Interest',
    style: { stroke: '#10b981' },
  },
  {
    id: 'e3-5',
    source: '3',
    target: '5',
    type: 'smoothstep',
    animated: true,
    label: 'Standard',
    style: { stroke: '#6b7280' },
  },
];
