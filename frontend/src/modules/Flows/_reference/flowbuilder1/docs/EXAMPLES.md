# Adding Custom Node Types - Example Guide

This guide demonstrates how to extend the Flow Builder with your own custom node types.

## Example: Adding a "Slack Notification" Node

### Step 1: Add Node to Library

Edit `data/nodeLibrary.js`:

```javascript
import { MessageCircle } from 'lucide-react';

export const nodeLibrary = {
  // ... existing categories
  
  Messaging: [
    // ... existing messaging nodes
    
    {
      id: 'slack-notification',
      type: 'action',
      label: 'Slack Notification',
      description: 'Send message to Slack channel',
      icon: <MessageCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    },
  ],
};
```

### Step 2: Add Configuration Form

Edit `components/NodeConfigPanel.jsx` to add a configuration form for your node:

```javascript
const renderConfigForm = () => {
  switch (node.type) {
    // ... existing cases
    
    case 'action':
      // Check if this is a Slack node
      if (node.data.label === 'Slack Notification') {
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Slack Workspace
              </label>
              <select
                value={config.workspace || ''}
                onChange={(e) => handleInputChange('workspace', e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
              >
                <option value="">Select workspace...</option>
                <option value="workspace-1">Sales Team</option>
                <option value="workspace-2">Marketing</option>
                <option value="workspace-3">Support</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Channel
              </label>
              <input
                type="text"
                value={config.channel || ''}
                onChange={(e) => handleInputChange('channel', e.target.value)}
                placeholder="#channel-name"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Message Template
              </label>
              <textarea
                value={config.message || ''}
                onChange={(e) => handleInputChange('message', e.target.value)}
                placeholder="New lead: {{contact.name}} - {{contact.email}}"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 min-h-32 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Use {'{{'}}variable{'}}'} syntax for dynamic values
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notification Priority
              </label>
              <select
                value={config.priority || 'normal'}
                onChange={(e) => handleInputChange('priority', e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="mentionUsers"
                checked={config.mentionUsers || false}
                onChange={(e) => handleInputChange('mentionUsers', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label
                htmlFor="mentionUsers"
                className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Mention @channel
              </label>
            </div>
          </div>
        );
      }
      
      // ... existing action config
      break;
  }
};
```

### Step 3: (Optional) Customize Node Appearance

If you want special rendering for your node, edit `components/nodes/CustomNode.jsx`:

```javascript
const CustomNode = ({ data, selected }) => {
  // Special rendering for Slack notifications
  if (data.label === 'Slack Notification') {
    return (
      <div className={`${getNodeStyles()} border-purple-500 dark:border-purple-400`}>
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 !bg-purple-500 !border-2 !border-white dark:!border-gray-800"
        />
        
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <MessageCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {data.label}
            </h3>
            
            {data.config?.channel && (
              <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
                <Hash className="w-3 h-3" />
                <span>{data.config.channel}</span>
              </div>
            )}
            
            {data.config?.message && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {data.config.message}
              </p>
            )}
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 !bg-purple-500 !border-2 !border-white dark:!border-gray-800"
        />
      </div>
    );
  }
  
  // ... existing rendering logic
};
```

## Example: Adding a "Database Query" Node with Multiple Outputs

For nodes that can have multiple output paths (like a database query that might succeed or fail):

### Step 1: Define Node

```javascript
// In nodeLibrary.js
{
  id: 'db-query',
  type: 'action',
  label: 'Database Query',
  description: 'Execute SQL query',
  icon: <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
  iconBg: 'bg-blue-100 dark:bg-blue-900/30',
  multiOutput: true, // Custom property
}
```

### Step 2: Custom Node Renderer with Multiple Handles

```javascript
// In CustomNode.jsx
const CustomNode = ({ data, selected }) => {
  if (data.label === 'Database Query') {
    return (
      <div className={getNodeStyles()}>
        <Handle type="target" position={Position.Top} />
        
        {/* Node content */}
        <div className="px-4 py-3">
          <h3>{data.label}</h3>
          {data.config?.query && (
            <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded mt-2">
              {data.config.query}
            </pre>
          )}
        </div>
        
        {/* Multiple output handles */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="success"
          style={{ left: '30%' }}
          className="w-3 h-3 !bg-green-500"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="error"
          style={{ left: '70%' }}
          className="w-3 h-3 !bg-red-500"
        />
        
        {/* Labels for outputs */}
        <div className="flex justify-around text-xs mt-1 text-gray-500">
          <span>Success</span>
          <span>Error</span>
        </div>
      </div>
    );
  }
  
  // ... default rendering
};
```

### Step 3: Configuration Form

```javascript
// In NodeConfigPanel.jsx
if (node.data.label === 'Database Query') {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Database Connection
        </label>
        <select
          value={config.connection || ''}
          onChange={(e) => handleInputChange('connection', e.target.value)}
          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
        >
          <option value="">Select connection...</option>
          <option value="prod-db">Production Database</option>
          <option value="analytics-db">Analytics Database</option>
          <option value="warehouse">Data Warehouse</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          SQL Query
        </label>
        <textarea
          value={config.query || ''}
          onChange={(e) => handleInputChange('query', e.target.value)}
          placeholder="SELECT * FROM contacts WHERE..."
          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm min-h-40"
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="useTransaction"
          checked={config.useTransaction || false}
          onChange={(e) => handleInputChange('useTransaction', e.target.checked)}
          className="w-4 h-4 text-blue-600 rounded"
        />
        <label htmlFor="useTransaction" className="ml-2 text-sm">
          Use transaction
        </label>
      </div>
    </div>
  );
}
```

## Example: Adding Validation for Custom Node

Create a validation function for your custom node:

```javascript
// Create: src/modules/flow-builder/validators/slackValidator.js

export function validateSlackNode(nodeConfig) {
  const errors = [];
  
  if (!nodeConfig.workspace) {
    errors.push('Slack workspace is required');
  }
  
  if (!nodeConfig.channel) {
    errors.push('Channel is required');
  } else if (!nodeConfig.channel.startsWith('#')) {
    errors.push('Channel must start with #');
  }
  
  if (!nodeConfig.message || nodeConfig.message.trim() === '') {
    errors.push('Message template is required');
  }
  
  // Validate variable syntax
  const variableRegex = /\{\{([^}]+)\}\}/g;
  const variables = [...nodeConfig.message.matchAll(variableRegex)];
  const validVariables = ['contact.name', 'contact.email', 'deal.amount'];
  
  variables.forEach(match => {
    if (!validVariables.includes(match[1])) {
      errors.push(`Unknown variable: ${match[1]}`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

Use in NodeConfigPanel:

```javascript
import { validateSlackNode } from '../validators/slackValidator';

const handleSave = () => {
  if (node.data.label === 'Slack Notification') {
    const validation = validateSlackNode(config);
    
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
  }
  
  onSave(node.id, config);
};
```

## Example: Adding Node Execution Logic (Backend)

On your backend, handle the custom node execution:

```javascript
// backend/services/flowExecutor.js

async function executeNode(node, context) {
  switch (node.data.label) {
    case 'Slack Notification':
      return await executeSlackNotification(node, context);
    
    case 'Database Query':
      return await executeDatabaseQuery(node, context);
    
    // ... other nodes
  }
}

async function executeSlackNotification(node, context) {
  const { workspace, channel, message, priority, mentionUsers } = node.data.config;
  
  // Interpolate variables
  const interpolatedMessage = interpolateVariables(message, context);
  
  // Add mention if needed
  const finalMessage = mentionUsers 
    ? `<!channel> ${interpolatedMessage}`
    : interpolatedMessage;
  
  // Send to Slack
  const slackClient = getSlackClient(workspace);
  const result = await slackClient.chat.postMessage({
    channel: channel,
    text: finalMessage,
    priority: priority,
  });
  
  return {
    success: true,
    messageId: result.ts,
    channel: result.channel,
  };
}

function interpolateVariables(template, context) {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    return getNestedValue(context, path) || match;
  });
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}
```

## Example: Adding Custom Styling Theme

Create a theme file for your custom nodes:

```javascript
// src/modules/flow-builder/themes/nodeThemes.js

export const nodeThemes = {
  'Slack Notification': {
    borderColor: 'border-purple-500 dark:border-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
    accentColor: 'text-purple-600 dark:text-purple-400',
  },
  'Database Query': {
    borderColor: 'border-blue-500 dark:border-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    accentColor: 'text-blue-600 dark:text-blue-400',
  },
};

export function getNodeTheme(nodeLabel) {
  return nodeThemes[nodeLabel] || {
    borderColor: 'border-gray-300 dark:border-gray-600',
    bgColor: 'bg-white dark:bg-gray-800',
    iconBg: 'bg-gray-100 dark:bg-gray-700',
    iconColor: 'text-gray-600 dark:text-gray-400',
    accentColor: 'text-gray-600 dark:text-gray-400',
  };
}
```

Use in CustomNode:

```javascript
import { getNodeTheme } from '../themes/nodeThemes';

const CustomNode = ({ data, selected }) => {
  const theme = getNodeTheme(data.label);
  
  return (
    <div className={`... ${theme.borderColor} ${theme.bgColor}`}>
      {/* ... */}
    </div>
  );
};
```

## Summary

To add a custom node type:

1. **Add to library** - Define in `nodeLibrary.js`
2. **Configuration form** - Add to `NodeConfigPanel.jsx`
3. **Custom rendering** (optional) - Modify `CustomNode.jsx`
4. **Validation** (optional) - Create validator function
5. **Execution logic** - Implement on backend
6. **Styling** (optional) - Define theme

This modular approach keeps the codebase clean and maintainable while allowing unlimited extensibility.
