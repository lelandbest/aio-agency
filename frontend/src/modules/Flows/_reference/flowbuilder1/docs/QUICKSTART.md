# Quick Start Guide

Get the Flow Builder running in 5 minutes.

## Installation

```bash
# 1. Navigate to the project directory
cd flow-builder

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

The app will open at `http://localhost:3000`

## First Look

You'll see three panels:

- **Left**: Node library with drag-and-drop nodes
- **Center**: Flow canvas for building workflows
- **Right**: Automation info and controls

## Build Your First Flow

1. **Drag a trigger** from "Triggers" section to the canvas
2. **Drag an action** from "Messaging" section below the trigger
3. **Connect them** by dragging from the bottom handle of the trigger to the top handle of the action
4. **Configure nodes** by clicking on them
5. **Save** using the button in the right panel

## Toggle Dark Mode

```javascript
// Add to your app or run in browser console
document.documentElement.classList.toggle('dark');
```

## Project Structure

```
flow-builder/
├── components/           # UI components
│   ├── NodeLibraryPanel.jsx
│   ├── AutomationInfoPanel.jsx
│   ├── NodeConfigPanel.jsx
│   └── nodes/
│       └── CustomNode.jsx
├── data/                # Data and configuration
│   ├── nodeLibrary.js
│   └── initialFlowData.js
├── FlowBuilder.jsx      # Main component
├── App.jsx              # App wrapper
├── main.jsx             # Entry point
└── styles.css           # Global styles
```

## Key Features

### Drag & Drop
- All nodes in the left panel are draggable
- Drop anywhere on the canvas
- Nodes snap into place automatically

### Node Configuration
- Click any node to configure
- Multiple tabs: General and Advanced
- Forms adapt to node type
- Save or cancel changes

### Visual Feedback
- Selected nodes highlighted with blue ring
- Animated edges show flow direction
- Hover states on all interactive elements
- Dark mode support throughout

## Customization

### Add Your Own Node Type

1. Edit `data/nodeLibrary.js`:
```javascript
{
  id: 'my-node',
  type: 'action',
  label: 'My Custom Node',
  icon: <YourIcon />,
  iconBg: 'bg-blue-100 dark:bg-blue-900/30',
}
```

2. Add configuration in `components/NodeConfigPanel.jsx`

See EXAMPLES.md for detailed guides.

### Change Theme Colors

Edit `tailwind.config.js` to customize colors:

```javascript
theme: {
  extend: {
    colors: {
      primary: '#your-color',
      // ... more colors
    }
  }
}
```

## Integration with Your CRM

### As a React Component

```jsx
import FlowBuilder from './flow-builder/FlowBuilder';

function AutomationPage() {
  return <FlowBuilder />;
}
```

### With API Integration

```jsx
<FlowBuilder
  flowId={flowId}
  onSave={async (data) => {
    await api.saveAutomation(data);
  }}
  onLoad={async (id) => {
    return await api.loadAutomation(id);
  }}
/>
```

See INTEGRATION.md for complete integration guide.

## Keyboard Shortcuts (Future)

These are ready to implement:

- `Ctrl/Cmd + S` - Save flow
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` - Redo
- `Delete` - Remove selected node
- `Ctrl/Cmd + A` - Select all nodes

## Troubleshooting

### Nodes won't drag to canvas
- Check browser console for errors
- Ensure ReactFlow is properly installed

### Dark mode not working
- Verify `dark` class is on `<html>` element
- Check Tailwind configuration

### Canvas not loading
- Clear browser cache
- Reinstall node_modules: `rm -rf node_modules && npm install`

## Next Steps

1. **Read README.md** - Full feature documentation
2. **Check ARCHITECTURE.md** - Understanding the codebase
3. **Review EXAMPLES.md** - Add custom nodes
4. **See INTEGRATION.md** - CRM integration guide

## Production Build

```bash
# Create optimized build
npm run build

# Preview production build
npm run preview

# Build files will be in /dist directory
```

## Get Help

- **Documentation**: README.md, ARCHITECTURE.md, INTEGRATION.md, EXAMPLES.md
- **Issues**: Check console for error messages
- **Questions**: Review the comprehensive guides

---

**Happy Building!** 🎉

The Flow Builder is production-ready and fully extensible. Start simple, then customize as needed.
