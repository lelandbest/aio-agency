export const formTemplateCategories = ['All', 'Lead Capture', 'Booking', 'Support', 'Orders'];

export const formTemplates = [
  {
    id: 'lead-intake',
    name: 'Lead Intake',
    category: 'Lead Capture',
    description: 'Capture new leads with contact details and qualification notes.',
    complexity: 'Basic',
    fields: [
      { type: 'text', label: 'Full Name', required: true },
      { type: 'email', label: 'Email Address', required: true, mapToContact: 'email', isIdentifier: true },
      { type: 'tel', label: 'Phone Number', mapToContact: 'phone' },
      { type: 'textarea', label: 'What do you need help with?' },
    ],
  },
  {
    id: 'demo-request',
    name: 'Demo Request',
    category: 'Booking',
    description: 'Qualify inbound demo interest before routing to calendar and CRM.',
    complexity: 'Intermediate',
    fields: [
      { type: 'text', label: 'Full Name', required: true },
      { type: 'email', label: 'Work Email', required: true, mapToContact: 'email', isIdentifier: true },
      { type: 'text', label: 'Company', required: true },
      { type: 'select', label: 'Team Size', options: ['1-10', '11-50', '51-200', '200+'] },
      { type: 'textarea', label: 'Primary Goal' },
    ],
  },
  {
    id: 'support-request',
    name: 'Support Request',
    category: 'Support',
    description: 'Route support tickets with clear issue and urgency capture.',
    complexity: 'Intermediate',
    fields: [
      { type: 'text', label: 'Full Name', required: true },
      { type: 'email', label: 'Email Address', required: true, mapToContact: 'email', isIdentifier: true },
      { type: 'select', label: 'Urgency', options: ['Low', 'Normal', 'High', 'Critical'], required: true },
      { type: 'textarea', label: 'Issue Summary', required: true },
    ],
  },
  {
    id: 'order-form',
    name: 'Order Form',
    category: 'Orders',
    description: 'Collect purchase details with contact and fulfillment inputs.',
    complexity: 'Advanced',
    fields: [
      { type: 'text', label: 'Customer Name', required: true },
      { type: 'email', label: 'Email Address', required: true, mapToContact: 'email', isIdentifier: true },
      { type: 'tel', label: 'Phone Number', mapToContact: 'phone' },
      { type: 'address', label: 'Shipping Address', required: true },
      { type: 'textarea', label: 'Order Notes' },
    ],
  },
];
