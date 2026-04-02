# Integrations Module

A comprehensive integration management system for the AIO Agency platform. This module allows users to connect, configure, and manage various third-party API services across multiple categories.

## Features

### Core Features
- **Multi-category integrations**: Automation, Calendar, Email, LLMs, SMS, and Tracking
- **Active integrations dashboard**: View all connected integrations with status at a glance
- **Card-based UI**: Each integration displayed as a card with branding, toggle, and settings
- **Slide-out configuration panel**: Add new integrations with dynamic forms
- **Custom logo upload**: Override default brand icons with custom logos
- **Enable/disable toggles**: Quickly activate or deactivate integrations
- **Settings management**: Configure API keys and connection details
- **Dashboard widget**: Monitor integration status from the main dashboard

### Supported Integrations

#### Automation
- Zapier
- Make (Integromat)

#### Calendar
- Google Calendar
- Microsoft 365

#### Email
- AWS SES
- SendGrid
- Mailgun
- SMTP (Generic)

#### LLMs
- OpenAI (GPT-4, GPT-3.5, etc.)
- Anthropic Claude
- Google AI (Gemini)
- Cohere

#### SMS
- Twilio
- Plivo
- SMS Everyone

#### Tracking
- Facebook Conversion Pixel
- Google Analytics

## File Structure

```
src/modules/Integrations/
├── components/
│   ├── IntegrationCard.jsx           # Individual integration card component
│   ├── IntegrationCard.css
│   ├── IntegrationTabs.jsx           # Tab navigation for categories
│   ├── IntegrationTabs.css
│   ├── AddIntegrationPanel.jsx       # Slide-out add integration panel
│   ├── AddIntegrationPanel.css
│   └── IntegrationStatusWidget.jsx   # Dashboard widget
│   └── IntegrationStatusWidget.css
├── pages/
│   ├── ActiveIntegrations.jsx        # Main dashboard page
│   └── ActiveIntegrations.css
├── utils/
│   ├── integrationConfigs.js         # Integration provider configurations
│   └── brandIcons.js                 # Brand icons and colors
├── index.jsx                         # Module entry point
└── README.md                         # This file
```

## Usage

### Import the Module
```jsx
import Integrations from './modules/Integrations';

// In your router or App.jsx
<Route path="/integrations" element={<Integrations />} />
```

### Using the IntegrationStatusWidget in Dashboard
```jsx
import IntegrationStatusWidget from './modules/Integrations/components/IntegrationStatusWidget';

// In your Dashboard component
<IntegrationStatusWidget onViewAllClick={() => navigate('/integrations')} />
```

## Data Structure

### Integration Object
```javascript
{
  id: string,                    // Unique identifier
  providerId: string,            // Provider ID (e.g., 'openai', 'twilio')
  category: string,              // Category ID (automation, calendar, email, llms, sms, tracking)
  config: object,                // Provider-specific configuration
  customLogo: string | null,     // Data URL for custom logo
  enabled: boolean,              // Whether integration is active
  createdAt: string,             // ISO timestamp
  configuredAt: string,          // ISO timestamp
}
```

### Provider Configuration
```javascript
{
  id: string,                    // Unique provider ID
  name: string,                  // Display name
  icon: string,                  // Icon identifier
  description: string,           // Short description
  fields: [                      // Configuration fields
    {
      name: string,
      label: string,
      type: string,              // 'text', 'password', 'email', 'number', 'tel', 'checkbox'
      required: boolean,
      default: any,
    }
  ],
  logo: string | null,           // CDN URL for provider logo
}
```

## API Reference

### Integration Configuration Functions

#### `getProvidersByCategory(category)`
Get all providers for a specific category.
```javascript
const providers = getProvidersByCategory(INTEGRATION_CATEGORIES.EMAIL);
```

#### `getProviderConfig(providerId)`
Get configuration details for a specific provider.
```javascript
const config = getProviderConfig('openai');
```

#### `getAllCategories()`
Get all available integration categories.
```javascript
const categories = getAllCategories();
```

### MockSupabase Functions

#### `mockSupabase.from(table).select(columns)`
Select records from a table.
```javascript
const { data, error } = await mockSupabase.from('integrations').select('*');
```

#### `mockSupabase.from(table).insert(rows)`
Insert new records.
```javascript
const { data, error } = await mockSupabase.from('integrations').insert([integration]);
```

#### `mockSupabase.from(table).update(id, updates)`
Update existing records.
```javascript
await mockSupabase.from('integrations').update(integrationId, { enabled: true });
```

#### `mockSupabase.from(table).delete(id)`
Delete records.
```javascript
await mockSupabase.from('integrations').delete(integrationId);
```

## Component Props

### IntegrationCard
```jsx
<IntegrationCard
  integration={integrationObject}
  provider={providerConfig}
  isEnabled={boolean}
  onToggle={(id) => {}}
  onSettings={(id) => {}}
  onRemove={(id) => {}}
  customLogo={string | null}
/>
```

### IntegrationTabs
```jsx
<IntegrationTabs
  categories={Array}
  activeCategory={string}
  onCategoryChange={(categoryId) => {}}
  counts={Object}
/>
```

### AddIntegrationPanel
```jsx
<AddIntegrationPanel
  isOpen={boolean}
  category={string}
  onClose={() => {}}
  onSave={(data) => {}}
  onCategoryChange={(categoryId) => {}}
  categories={Array}
/>
```

### IntegrationStatusWidget
```jsx
<IntegrationStatusWidget
  onViewAllClick={() => {}}
/>
```

## Styling

The module uses CSS modules with the following naming convention:
- `component-name__element` for block elements
- `component-name__element--modifier` for element modifiers
- `component-name__element--state` for state modifiers

All components are responsive and mobile-friendly with breakpoints at 768px and 1024px.

## State Management

This module uses React hooks for state management:
- `useState` for local component state
- `useEffect` for side effects (data loading)
- MockSupabase for persistent data storage

## Future Enhancements

- [ ] Real-time sync with actual Supabase
- [ ] Integration health monitoring
- [ ] API usage analytics
- [ ] Error logging and notifications
- [ ] Integration templates
- [ ] Webhook management
- [ ] OAuth flow support
- [ ] Audit logs for integration changes

## Troubleshooting

### Integrations not persisting
- Check browser console for errors
- Verify mockSupabase is properly initialized
- Clear browser storage and reload

### Icons not displaying
- Verify CDN URLs are accessible
- Check fallback SVG icons in brandIcons.js
- Ensure custom logos are valid image URLs

### Form validation not working
- Check field configuration in integrationConfigs.js
- Verify all required fields have `required: true`
- Check AddIntegrationPanel error states

## Performance Considerations

- MockSupabase operations simulate 200-300ms network delay for realistic behavior
- Large integration lists use pagination (shows top 3 in widget)
- CSS animations use GPU acceleration (transform, opacity)
- Images are lazy-loaded where possible

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari 14+, Android Chrome 90+)

## License

Part of the AIO Agency platform. All rights reserved.
