# Flow Builder - Production CRM Module

A production-ready workflow automation builder designed for CRM integration. Built with React, ReactFlow, and Tailwind CSS.

## Features

### Core Functionality
- **Drag-and-drop interface** - Intuitive node placement from categorized library
- **Visual flow canvas** - Infinite canvas with zoom, pan, and fit-to-view controls
- **Node configuration** - Modal-based configuration panels with form validation
- **Multi-node types** - Triggers, Actions, Logic, and Webhooks
- **Branch visualization** - Conditional paths with labeled edges
- **Light/Dark mode** - Full theme support with CRM integration safety

### Layout Structure

#### Left Panel - Node Library
- Fixed width (320px), vertically scrollable
- Categorized sections: Messaging, Logic, CRM, Data Services, AI Employee, Triggers
- All categories can be expanded simultaneously
- Custom icons for each node type
- Drag-to-canvas functionality

#### Center - Flow Canvas
- ReactFlow-powered infinite canvas
- Vertical flow layout (top → bottom)
- Subtle grid background
- Smooth edge connections with animations
- Interactive controls (zoom, pan, fit view)
- Mini-map navigation

#### Right Panel - Automation Info
- Fixed width (384px), vertically scrollable
- Inline-editable flow name
- Status indicators (Active/Draft)
- Metadata display (creators, timestamps, node count)
- Primary actions (Save, Activate/Deactivate)
- Configuration settings section

### Node System

**Node Types:**
- `trigger` - Workflow initiators (form submissions, contact events, schedules)
- `action` - Operations (email, SMS, CRM updates, API calls)
- `logic` - Control flow (conditions, delays, filters, loops)
- `webhook` - External integrations (HTTP requests, webhooks)

**Node Features:**
- Category-specific color coding
- Configuration persistence
- Visual feedback on selection
- Smooth drag animations
- Connection handles (top/bottom)

### Node Configuration

Click any node to open configuration modal with:
- **General Tab** - Primary settings specific to node type
- **Advanced Tab** - Error handling, timeouts, logging options
- Form validation (future)
- Tab-based organization for extensibility

Configuration examples:
- **Triggers**: Event selection, condition rules
- **Actions**: Action type, templates, recipients
- **Logic**: Condition types, logic rules
- **Webhooks**: URL, HTTP method, headers, body

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
flow-builder/
├── components/
│   ├── NodeLibraryPanel.jsx      # Left panel with draggable nodes
│   ├── AutomationInfoPanel.jsx   # Right panel with flow metadata
│   ├── NodeConfigPanel.jsx       # Modal for node configuration
│   └── nodes/
│       └── CustomNode.jsx         # Custom node renderer
├── data/
│   ├── nodeLibrary.js             # Node definitions and categories
│   └── initialFlowData.js         # Sample flow data
├── FlowBuilder.jsx                # Main flow builder component
├── App.jsx                        # Application wrapper
├── main.jsx                       # Entry point
├── styles.css                     # Global styles + Tailwind
├── index.html                     # HTML template
├── package.json                   # Dependencies
├── vite.config.js                 # Vite configuration
├── tailwind.config.js             # Tailwind configuration
└── postcss.config.js              # PostCSS configuration
```

## Architecture

### State Management
- **React Flow State**: `useNodesState`, `useEdgesState` for canvas
- **Local State**: Component-level state for panels and modals
- **Extensibility**: Structured for future Redux/Zustand integration

### Component Separation
- **Presentation**: UI components (panels, modals)
- **Logic**: Flow management (connections, drag-drop)
- **Data**: Node definitions, initial configurations
- **Future**: Business logic will remain separate from UI

### Theme Integration
- Uses Tailwind CSS utility classes
- No hard-coded colors
- Inherits from parent CRM theme context
- `dark:` variants for dark mode support
- CSS custom properties ready

### Event Handling
- **Drag & Drop**: Node library → canvas
- **Connections**: Automatic edge creation with smooth animations
- **Node Selection**: Click to open configuration
- **Configuration**: Save/cancel flows with state updates

## CRM Integration Guidelines

### Mounting the Module

```jsx
// In your CRM application
import FlowBuilder from './flow-builder/FlowBuilder';

function AutomationPage() {
  return (
    <div className="crm-page">
      <CRMHeader />
      <FlowBuilder />
      <CRMFooter />
    </div>
  );
}
```

### Theme Context

The FlowBuilder assumes global theme context exists:

```jsx
// Your CRM should provide:
<ThemeProvider theme={crmTheme}>
  <FlowBuilder />
</ThemeProvider>
```

### Future API Integration Points

1. **Save Flow**: `onSave(flowData)` callback
2. **Load Flow**: Pass initial `nodes` and `edges` as props
3. **Validate Node**: `onValidateNode(nodeConfig)` hook
4. **External Actions**: Webhooks, API calls through CRM service layer

### Styling Safety

- All components use Tailwind utilities
- No global CSS pollution
- Scoped styles for ReactFlow elements only
- Respects parent container dimensions

## Extensibility

### Adding New Node Types

1. Define in `data/nodeLibrary.js`:
```javascript
{
  id: 'new-node',
  type: 'action',
  label: 'New Action',
  icon: <YourIcon />,
  iconBg: 'bg-color-100 dark:bg-color-900/30',
}
```

2. Add configuration form in `NodeConfigPanel.jsx`

3. Update node renderer in `CustomNode.jsx` if needed

### Adding Configuration Tabs

```jsx
// In NodeConfigPanel.jsx
const [activeTab, setActiveTab] = useState('general');

// Add new tab button
<button onClick={() => setActiveTab('integrations')}>
  Integrations
</button>

// Add tab content
{activeTab === 'integrations' && (
  <IntegrationConfig config={config} onChange={handleInputChange} />
)}
```

### Future Enhancements (Structured For)

- **Undo/Redo**: State history with action stack
- **Autosave**: Debounced save with draft indicators
- **Validation**: Node-level and flow-level validation
- **Templates**: Pre-built flow templates
- **Testing**: Node execution testing interface
- **Analytics**: Flow performance metrics
- **Collaboration**: Real-time multi-user editing

## Technical Standards

### Code Quality
- Clean component separation
- Prop validation ready (add PropTypes or TypeScript)
- Semantic HTML
- Accessible controls (keyboard navigation ready)

### Performance
- Optimized re-renders with `useCallback`
- Memoization ready for node renderers
- Lazy loading potential for node library

### Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- CSS Grid and Flexbox
- ES6+ features
- ReactFlow browser requirements

## Development Notes

### Dark Mode Toggle

Add to your CRM header:

```jsx
<button onClick={() => document.documentElement.classList.toggle('dark')}>
  Toggle Theme
</button>
```

### Custom Node Icons

Uses Lucide React icons. To add custom icons:

```jsx
import { YourIcon } from 'lucide-react';

// Or use custom SVG
const CustomIcon = () => (
  <svg>...</svg>
);
```

### Edge Styling

Customize in `FlowBuilder.jsx`:

```javascript
defaultEdgeOptions={{
  type: 'smoothstep', // or 'default', 'straight', 'step'
  animated: true,
  style: { strokeWidth: 2, stroke: '#3b82f6' },
}}
```

## License

Proprietary - Internal CRM Module

## Support

For integration questions or feature requests, contact the development team.

---

**Note**: This is a production-ready module designed for integration into an existing CRM platform. It assumes external routing, authentication, and API services are handled by the parent application.
