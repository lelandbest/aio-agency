# CRM Integration Guide

This guide walks through integrating the Flow Builder module into your existing CRM platform.

## Prerequisites

- React 18.x application
- Tailwind CSS configured
- Build system (Vite, Webpack, or similar)
- Node.js 18+ development environment

## Integration Steps

### Step 1: Install Dependencies

Add the Flow Builder to your CRM project:

```bash
# Copy the flow-builder directory into your project
cp -r flow-builder/ src/modules/

# Install required dependencies
npm install @xyflow/react@^12.0.0 lucide-react@^0.263.1
```

### Step 2: Configure Tailwind

Ensure your `tailwind.config.js` includes the Flow Builder paths:

```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./src/modules/flow-builder/**/*.{js,jsx}",  // Add this line
  ],
  darkMode: 'class',
  // ... rest of your config
}
```

### Step 3: Import Styles

Add ReactFlow styles to your main CSS file:

```css
/* src/index.css or src/styles/global.css */
@import '@xyflow/react/dist/style.css';
```

### Step 4: Create Route

Add the Flow Builder to your routing configuration:

```jsx
// src/App.jsx or routes configuration
import FlowBuilder from './modules/flow-builder/FlowBuilder';

function App() {
  return (
    <Router>
      <Routes>
        {/* Your existing routes */}
        <Route path="/automation/:flowId?" element={<AutomationPage />} />
      </Routes>
    </Router>
  );
}

// src/pages/AutomationPage.jsx
import FlowBuilder from '../modules/flow-builder/FlowBuilder';

export default function AutomationPage() {
  return (
    <div className="h-screen flex flex-col">
      <CRMHeader title="Automation Builder" />
      <div className="flex-1">
        <FlowBuilder />
      </div>
    </div>
  );
}
```

### Step 5: Theme Integration

The Flow Builder inherits your theme automatically through Tailwind's dark mode class.

To toggle dark mode:

```jsx
// In your theme provider or header component
const toggleDarkMode = () => {
  document.documentElement.classList.toggle('dark');
  // Optionally persist preference
  localStorage.setItem(
    'theme', 
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
};

// On app load
useEffect(() => {
  const theme = localStorage.getItem('theme');
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  }
}, []);
```

## API Integration

### Saving Flows

Extend FlowBuilder with save functionality:

```jsx
// src/modules/flow-builder/FlowBuilder.jsx

const FlowBuilder = ({ flowId, onSave }) => {
  // ... existing code
  
  const handleSave = async () => {
    const flowData = {
      id: flowId,
      name: automationInfo.name,
      status: automationInfo.status,
      nodes: nodes.map(node => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),
      edges: edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        label: edge.label,
      })),
      metadata: {
        createdBy: automationInfo.createdBy,
        lastEdited: new Date().toISOString(),
      },
    };
    
    try {
      await onSave(flowData);
      // Show success message
      toast.success('Flow saved successfully');
    } catch (error) {
      // Show error message
      toast.error('Failed to save flow');
      console.error('Save error:', error);
    }
  };
  
  return (
    // Update AutomationInfoPanel to use handleSave
    <AutomationInfoPanel onSave={handleSave} />
  );
};
```

Usage in your CRM:

```jsx
// src/pages/AutomationPage.jsx
import { useParams } from 'react-router-dom';
import { saveAutomation } from '../api/automations';

export default function AutomationPage() {
  const { flowId } = useParams();
  
  const handleSaveFlow = async (flowData) => {
    if (flowId) {
      // Update existing flow
      await saveAutomation(flowId, flowData);
    } else {
      // Create new flow
      const newFlow = await createAutomation(flowData);
      // Redirect to edit page with ID
      navigate(`/automation/${newFlow.id}`);
    }
  };
  
  return <FlowBuilder flowId={flowId} onSave={handleSaveFlow} />;
}
```

### Loading Flows

Add flow loading capability:

```jsx
// FlowBuilder.jsx
const FlowBuilder = ({ flowId, onSave, onLoad }) => {
  
  useEffect(() => {
    if (flowId && onLoad) {
      loadFlow();
    }
  }, [flowId]);
  
  const loadFlow = async () => {
    try {
      const flowData = await onLoad(flowId);
      setNodes(flowData.nodes || []);
      setEdges(flowData.edges || []);
      setAutomationInfo({
        name: flowData.name,
        status: flowData.status,
        createdBy: flowData.metadata.createdBy,
        editedBy: flowData.metadata.editedBy,
        nodeCount: flowData.nodes.length,
        lastEdited: formatDate(flowData.metadata.lastEdited),
      });
    } catch (error) {
      console.error('Load error:', error);
      toast.error('Failed to load flow');
    }
  };
};
```

### API Service Example

```javascript
// src/api/automations.js

const API_BASE = process.env.REACT_APP_API_URL;

export async function getAutomation(id) {
  const response = await fetch(`${API_BASE}/automations/${id}`, {
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch automation');
  }
  
  return response.json();
}

export async function saveAutomation(id, data) {
  const response = await fetch(`${API_BASE}/automations/${id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to save automation');
  }
  
  return response.json();
}

export async function createAutomation(data) {
  const response = await fetch(`${API_BASE}/automations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create automation');
  }
  
  return response.json();
}

export async function activateAutomation(id) {
  const response = await fetch(`${API_BASE}/automations/${id}/activate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to activate automation');
  }
  
  return response.json();
}
```

## Validation Integration

Add validation before saving:

```jsx
// src/modules/flow-builder/validation.js

export function validateFlow(flowData) {
  const errors = [];
  
  // Check for trigger node
  const hasTrigger = flowData.nodes.some(node => node.type === 'trigger');
  if (!hasTrigger) {
    errors.push('Flow must have at least one trigger node');
  }
  
  // Check for orphaned nodes
  const connectedNodes = new Set();
  flowData.edges.forEach(edge => {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  });
  
  const orphanedNodes = flowData.nodes.filter(
    node => node.type !== 'trigger' && !connectedNodes.has(node.id)
  );
  
  if (orphanedNodes.length > 0) {
    errors.push(`${orphanedNodes.length} node(s) are not connected`);
  }
  
  // Validate node configurations
  flowData.nodes.forEach(node => {
    if (!node.data.config || Object.keys(node.data.config).length === 0) {
      errors.push(`Node "${node.data.label}" is not configured`);
    }
    
    // Type-specific validation
    if (node.type === 'webhook' && !node.data.config.url) {
      errors.push(`Webhook node "${node.data.label}" missing URL`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

Usage:

```jsx
// FlowBuilder.jsx
import { validateFlow } from './validation';

const handleSave = async () => {
  const flowData = { /* ... */ };
  
  const validation = validateFlow(flowData);
  
  if (!validation.isValid) {
    // Show errors to user
    validation.errors.forEach(error => {
      toast.error(error);
    });
    return;
  }
  
  // Proceed with save
  await onSave(flowData);
};
```

## Authentication & Permissions

### Check User Permissions

```jsx
// src/pages/AutomationPage.jsx
import { useAuth } from '../contexts/AuthContext';

export default function AutomationPage() {
  const { user, hasPermission } = useAuth();
  
  if (!hasPermission('automations.view')) {
    return <AccessDenied />;
  }
  
  const canEdit = hasPermission('automations.edit');
  
  return (
    <FlowBuilder
      flowId={flowId}
      readOnly={!canEdit}
      onSave={canEdit ? handleSaveFlow : undefined}
    />
  );
}
```

### Read-Only Mode

Modify FlowBuilder to support read-only:

```jsx
// FlowBuilder.jsx
const FlowBuilder = ({ flowId, onSave, readOnly = false }) => {
  return (
    <>
      <NodeLibraryPanel disabled={readOnly} />
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
      />
      
      <AutomationInfoPanel
        readOnly={readOnly}
        showSaveButton={!readOnly}
      />
    </>
  );
};
```

## Analytics & Tracking

Track user interactions:

```jsx
// FlowBuilder.jsx
import { trackEvent } from '../analytics';

const onDrop = useCallback((event) => {
  // ... existing drop logic
  
  trackEvent('flow_builder', 'node_added', {
    nodeType: type,
    category: category,
    flowId: flowId,
  });
}, []);

const handleSave = async () => {
  // ... save logic
  
  trackEvent('flow_builder', 'flow_saved', {
    flowId: flowId,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });
};
```

## Error Monitoring

Integrate with your error tracking service:

```jsx
// src/modules/flow-builder/errorBoundary.jsx
import * as Sentry from '@sentry/react';

export class FlowBuilderErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
        flowBuilder: {
          flowId: this.props.flowId,
          nodeCount: this.props.nodeCount,
        },
      },
    });
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReset={this.resetErrorBoundary} />;
    }
    
    return this.props.children;
  }
}

// Usage
<FlowBuilderErrorBoundary flowId={flowId} nodeCount={nodes.length}>
  <FlowBuilder />
</FlowBuilderErrorBoundary>
```

## Testing Integration

### Setup Test Environment

```javascript
// src/modules/flow-builder/__tests__/setup.js
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';

// Mock ReactFlow
jest.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }) => <div data-testid="react-flow">{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  useNodesState: () => [[], jest.fn(), jest.fn()],
  useEdgesState: () => [[], jest.fn(), jest.fn()],
  addEdge: jest.fn(),
}));

afterEach(cleanup);
```

### Example Test

```javascript
// src/modules/flow-builder/__tests__/FlowBuilder.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import FlowBuilder from '../FlowBuilder';

describe('FlowBuilder', () => {
  it('renders all three panels', () => {
    render(<FlowBuilder />);
    
    expect(screen.getByText('Node Library')).toBeInTheDocument();
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    expect(screen.getByText('Automation Name')).toBeInTheDocument();
  });
  
  it('loads flow data on mount', async () => {
    const mockLoad = jest.fn().mockResolvedValue({
      name: 'Test Flow',
      nodes: [],
      edges: [],
    });
    
    render(<FlowBuilder flowId="123" onLoad={mockLoad} />);
    
    await waitFor(() => {
      expect(mockLoad).toHaveBeenCalledWith('123');
    });
  });
});
```

## Deployment Checklist

- [ ] Dependencies installed
- [ ] Tailwind configured to include Flow Builder paths
- [ ] ReactFlow styles imported
- [ ] Routes configured
- [ ] Theme provider includes dark mode support
- [ ] API endpoints configured
- [ ] Authentication integrated
- [ ] Permissions checked
- [ ] Validation implemented
- [ ] Error tracking configured
- [ ] Analytics tracking added
- [ ] Tests written and passing
- [ ] Performance benchmarks met
- [ ] Accessibility audit passed

## Troubleshooting

### Issue: Dark mode not working

**Solution**: Ensure `dark` class is toggled on the `<html>` element:

```javascript
document.documentElement.classList.add('dark');
```

### Issue: Nodes not draggable to canvas

**Solution**: Check that `onDragOver` prevents default and sets `dropEffect`:

```javascript
const onDragOver = (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
};
```

### Issue: Tailwind styles not applied

**Solution**: Verify Flow Builder paths in `tailwind.config.js` content array.

### Issue: ReactFlow controls not visible

**Solution**: Ensure ReactFlow CSS is imported before your custom styles.

## Support

For implementation assistance:
- **Documentation**: See README.md and ARCHITECTURE.md
- **Issues**: Create ticket in your CRM issue tracker
- **Questions**: Contact development team

---

**Integration Version**: 1.0.0  
**Last Updated**: January 2026
