# Flow Builder Architecture

## Design Principles

### 1. Modularity
Every component is self-contained and reusable. The flow builder can be mounted anywhere in the CRM without side effects.

### 2. Extensibility
The architecture supports future features without requiring rewrites:
- State management patterns ready for global store
- Component props structured for additional callbacks
- Data structures designed for validation and transformation layers

### 3. Integration Safety
- Zero hard-coded business logic in UI components
- Theme-agnostic styling using Tailwind utilities
- No global CSS pollution
- Respects parent container boundaries

### 4. Performance
- Optimized re-renders with React hooks
- Virtual scrolling ready for large node libraries
- Debounce patterns for autosave implementation
- Memoization points identified

## Component Hierarchy

```
FlowBuilder (Container)
├── NodeLibraryPanel (Left)
│   ├── Category Dropdowns
│   └── Draggable Node Items
├── ReactFlow Canvas (Center)
│   ├── Background Grid
│   ├── Controls (Zoom/Pan)
│   ├── MiniMap
│   ├── CustomNode (Renderer)
│   └── Edges (Connections)
├── AutomationInfoPanel (Right)
│   ├── Editable Name
│   ├── Status Badge
│   ├── Metadata Display
│   └── Action Buttons
└── NodeConfigPanel (Modal)
    ├── Tab Navigation
    ├── Dynamic Form (per node type)
    └── Save/Cancel Actions
```

## State Flow

### Node State
```javascript
{
  id: string,              // Unique identifier
  type: string,            // 'trigger' | 'action' | 'logic' | 'webhook'
  position: {x, y},        // Canvas coordinates
  data: {
    label: string,         // Display name
    category: string,      // Node category
    config: object,        // Node-specific configuration
  }
}
```

### Edge State
```javascript
{
  id: string,              // Unique identifier
  source: string,          // Source node ID
  target: string,          // Target node ID
  type: string,            // 'smoothstep' | 'default' | 'straight'
  animated: boolean,       // Animation flag
  label?: string,          // Optional edge label
  style?: object,          // Custom styling
}
```

### Automation State
```javascript
{
  name: string,            // Flow name
  status: string,          // 'Active' | 'Draft'
  createdBy: string,       // Creator name
  editedBy: string,        // Last editor
  nodeCount: number,       // Total nodes
  lastEdited: string,      // Timestamp
}
```

## Data Flow Diagram

```
User Action → Event Handler → State Update → UI Re-render
                    ↓
              Validation (Future)
                    ↓
              API Call (Future)
```

### Example: Adding a Node

1. **User drags node from library**
2. `onDragStart` → Sets drag data
3. `onDrop` → Reads drag data + screen position
4. `screenToFlowPosition` → Converts to canvas coordinates
5. `setNodes` → Adds new node to state
6. ReactFlow re-renders with new node

### Example: Configuring a Node

1. **User clicks node**
2. `onNodeClick` → Sets `selectedNode` state
3. `NodeConfigPanel` renders with node data
4. **User edits fields**
5. Local state updates via `setConfig`
6. **User clicks "Save"**
7. `handleConfigSave` → Updates node data
8. `setSelectedNode(null)` → Closes modal

## Extension Points

### 1. Custom Node Types

**Location**: `components/nodes/CustomNode.jsx`

Add new visual styles or interactive elements:

```jsx
const CustomNode = ({ data, selected }) => {
  // Add custom rendering logic
  if (data.category === 'YourCategory') {
    return <YourCustomRenderer data={data} />;
  }
  // ... existing logic
};
```

### 2. Validation Layer

**Future Integration Point**:

```javascript
// In FlowBuilder.jsx
const validateNode = async (nodeConfig) => {
  const result = await api.validateNodeConfig(nodeConfig);
  return result.isValid;
};

const handleConfigSave = async (nodeId, config) => {
  const isValid = await validateNode(config);
  if (!isValid) {
    // Show validation errors
    return;
  }
  // Save logic
};
```

### 3. Persistence Layer

**Future Integration Point**:

```javascript
// Add to FlowBuilder props
const FlowBuilder = ({ 
  flowId,
  onSave,
  onLoad,
  onValidate 
}) => {
  
  const handleSave = async () => {
    const flowData = {
      id: flowId,
      nodes,
      edges,
      metadata: automationInfo,
    };
    await onSave(flowData);
  };
  
  useEffect(() => {
    if (flowId) {
      onLoad(flowId).then(data => {
        setNodes(data.nodes);
        setEdges(data.edges);
        setAutomationInfo(data.metadata);
      });
    }
  }, [flowId]);
};
```

### 4. Undo/Redo

**Future Implementation Pattern**:

```javascript
// State history manager
const [history, setHistory] = useState({
  past: [],
  present: { nodes, edges },
  future: [],
});

const undo = () => {
  if (history.past.length === 0) return;
  
  const previous = history.past[history.past.length - 1];
  const newPast = history.past.slice(0, -1);
  
  setHistory({
    past: newPast,
    present: previous,
    future: [history.present, ...history.future],
  });
  
  setNodes(previous.nodes);
  setEdges(previous.edges);
};
```

### 5. Collaboration

**Future Real-time Sync Pattern**:

```javascript
// WebSocket integration
useEffect(() => {
  const socket = io('wss://your-crm.com/flows');
  
  socket.on('node-updated', (update) => {
    setNodes(nds => nds.map(node => 
      node.id === update.id ? update : node
    ));
  });
  
  socket.on('user-cursor', (cursor) => {
    // Show collaborator cursor
  });
  
  return () => socket.disconnect();
}, []);
```

## Performance Optimization

### Current Optimizations

1. **useCallback for event handlers** - Prevents unnecessary re-renders
2. **Controlled re-renders** - Only affected nodes update
3. **Lazy state updates** - Batch operations when possible

### Future Optimizations

1. **Virtual scrolling** for node library (100+ items)
```javascript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={nodes.length}
  itemSize={60}
>
  {NodeItem}
</FixedSizeList>
```

2. **Memoize node renderers**
```javascript
const MemoizedNode = React.memo(CustomNode, (prev, next) => {
  return prev.selected === next.selected &&
         prev.data === next.data;
});
```

3. **Debounced autosave**
```javascript
const debouncedSave = useMemo(
  () => debounce(handleSave, 2000),
  []
);

useEffect(() => {
  debouncedSave(nodes, edges);
}, [nodes, edges]);
```

## Testing Strategy

### Unit Tests (Future)

```javascript
// NodeConfigPanel.test.jsx
describe('NodeConfigPanel', () => {
  it('renders correct form for trigger node', () => {
    const node = { type: 'trigger', data: {...} };
    render(<NodeConfigPanel node={node} />);
    expect(screen.getByLabelText('Trigger Event')).toBeInTheDocument();
  });
  
  it('saves configuration on submit', () => {
    const onSave = jest.fn();
    // ... test implementation
  });
});
```

### Integration Tests (Future)

```javascript
// FlowBuilder.test.jsx
describe('FlowBuilder Integration', () => {
  it('creates node from drag and drop', () => {
    // Simulate drag from library
    // Verify node appears on canvas
  });
  
  it('connects nodes with edges', () => {
    // Click and drag from handle to handle
    // Verify edge creation
  });
});
```

### E2E Tests (Future)

```javascript
// flow-creation.spec.js
describe('Flow Creation', () => {
  it('creates complete automation flow', () => {
    cy.visit('/automation/new');
    cy.dragNode('Form Submitted', 100, 100);
    cy.dragNode('Send Email', 100, 200);
    cy.connectNodes('Form Submitted', 'Send Email');
    cy.configureNode('Send Email', { template: 'welcome' });
    cy.saveFlow();
    cy.contains('Flow saved successfully');
  });
});
```

## Error Handling

### Current Implementation

- Try-catch blocks around async operations (ready for API calls)
- Validation-ready configuration forms
- User feedback via state updates

### Future Error Handling

```javascript
// Global error boundary
class FlowBuilderErrorBoundary extends React.Component {
  componentDidCatch(error, info) {
    // Log to error tracking service
    logError(error, info);
    // Show fallback UI
    this.setState({ hasError: true });
  }
}

// Node-level error display
const NodeWithError = ({ node }) => {
  const [error, setError] = useState(null);
  
  const validateNode = async () => {
    try {
      await api.validate(node);
    } catch (err) {
      setError(err.message);
    }
  };
  
  return (
    <CustomNode node={node}>
      {error && <ErrorBadge message={error} />}
    </CustomNode>
  );
};
```

## Security Considerations

### Input Sanitization (Future)

```javascript
// Sanitize user inputs
const sanitizeConfig = (config) => {
  return {
    ...config,
    url: sanitizeUrl(config.url),
    headers: sanitizeJson(config.headers),
    body: sanitizeJson(config.body),
  };
};
```

### XSS Prevention

- All user inputs displayed via React (auto-escaped)
- JSON fields validated before parsing
- URL fields validated against whitelist (future)

### Access Control (Future)

```javascript
// Check permissions before actions
const canEditFlow = (user, flow) => {
  return user.permissions.includes('edit_automations') &&
         (flow.createdBy === user.id || user.role === 'admin');
};

if (!canEditFlow(currentUser, flowData)) {
  return <ReadOnlyFlowBuilder />;
}
```

## Accessibility

### Current Implementation

- Semantic HTML structure
- Focus management ready
- Keyboard navigation supported by ReactFlow

### Future Enhancements

1. **Screen reader announcements**
```javascript
const [announcement, setAnnouncement] = useState('');

const announceAction = (message) => {
  setAnnouncement(message);
  setTimeout(() => setAnnouncement(''), 1000);
};

<div role="status" aria-live="polite" className="sr-only">
  {announcement}
</div>
```

2. **Keyboard shortcuts**
```javascript
useKeyboardShortcuts({
  'ctrl+s': handleSave,
  'ctrl+z': handleUndo,
  'ctrl+shift+z': handleRedo,
  'delete': handleDeleteSelected,
});
```

3. **ARIA labels**
```javascript
<button
  aria-label={`Configure ${node.data.label} node`}
  onClick={() => openConfig(node)}
>
  <Settings />
</button>
```

## Migration & Versioning

### Data Version Management (Future)

```javascript
const FLOW_VERSION = '1.0.0';

const migrateFlow = (flowData) => {
  const version = flowData.version || '0.0.0';
  
  if (version < '1.0.0') {
    // Migrate old structure
    flowData = migrateV0toV1(flowData);
  }
  
  return { ...flowData, version: FLOW_VERSION };
};
```

### Breaking Changes Protocol

1. Version all data structures
2. Maintain backward compatibility for 2 versions
3. Provide migration tools for deprecated features
4. Document changes in CHANGELOG.md

## Deployment Considerations

### Build Output

```bash
npm run build
# Outputs to: dist/
# Assets: hashed for cache busting
# Size: ~200KB gzipped (including ReactFlow)
```

### Environment Variables

```javascript
// Future configuration
const config = {
  apiUrl: import.meta.env.VITE_API_URL,
  wsUrl: import.meta.env.VITE_WS_URL,
  enableDebug: import.meta.env.VITE_DEBUG === 'true',
};
```

### Performance Budget

- Initial load: < 3s on 3G
- Time to interactive: < 5s
- Node render time: < 16ms (60fps)
- Canvas drag FPS: > 30fps

---

**Last Updated**: January 2026  
**Maintainers**: CRM Development Team
