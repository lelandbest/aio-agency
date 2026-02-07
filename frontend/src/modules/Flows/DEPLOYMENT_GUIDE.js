/**
 * FLOW BUILDER DEPLOYMENT & INTEGRATION GUIDE
 * AIO CRM - February 2, 2026
 */

// ============================================================================
// PRE-DEPLOYMENT CHECKLIST
// ============================================================================

/*
Before running npm install and dev server:

1. VERIFY FILE STRUCTURE
   ✓ /frontend/src/modules/Flows/FlowBuilder.jsx
   ✓ /frontend/src/modules/Flows/index.jsx
   ✓ /frontend/src/modules/Flows/components/FlowBuilderHeader.jsx
   ✓ /frontend/src/modules/Flows/components/NodeLibraryPanel.jsx
   ✓ /frontend/src/modules/Flows/components/FlowInfoPanel.jsx
   ✓ /frontend/src/modules/Flows/components/NodeConfigDrawer.jsx
   ✓ /frontend/src/modules/Flows/components/nodes/CustomNode.jsx
   ✓ /frontend/src/modules/Flows/data/nodeLibrary.js
   ✓ /frontend/src/modules/Flows/data/initialFlowData.js
   ✓ /frontend/src/modules/Flows/utils/flowRepository.js
   ✓ /frontend/src/modules/Flows/utils/ulid.js

2. VERIFY CODE CHANGES
   ✓ /frontend/src/App.jsx:
     - FlowsModule lazy import added
     - case 'flows': return <FlowsModule /> in switch
   
   ✓ /frontend/src/index.css:
     - Node-type tokens added (--node-trigger, --node-action, etc.)
     - Both light and dark mode definitions included
   
   ✓ /frontend/src/data/initialDb.js:
     - "Automations" > "Platforms" group removed (n8n, Make, Latenode links)
   
   ✓ /frontend/package.json:
     - "@xyflow/react": "^12.0.0" added to dependencies

3. NO MERGE CONFLICTS
   Review git status for conflicts before proceeding

4. BACKUP localStorage (if production)
   If upgrading existing app with flows, export current localStorage data
*/

// ============================================================================
// INSTALLATION STEPS
// ============================================================================

/*
Step 1: Install Dependencies
  cd frontend
  npm install

  Expected: 
    - Downloads @xyflow/react and peer dependencies
    - No peer dependency warnings (--legacy-peer-deps may be needed)

Step 2: Clean Build Cache (optional but recommended)
  rm -rf node_modules/.vite
  rm -rf dist/

Step 3: Start Dev Server
  npm run dev

  Expected output:
    - Vite dev server starts on http://localhost:3000
    - No compilation errors in console
    - Browser loads app at localhost:3000

Step 4: Test Flow Builder Launch
  - Login to CRM (or skip if already logged in)
  - Click "Flows" in left sidebar
  - FlowBuilder component should render with:
    * 2-row header (Save button + Status badge)
    * Left panel: Node Library (Triggers, Logic/Condition, Webhook/API, Messaging, Utilities/Data, Sockets)
    * Center: Empty ReactFlow canvas with grid background
    * Right panel: Flow Details with editable name
    * Breadcrumb showing "Flows"
*/

// ============================================================================
// VERIFICATION TESTS
// ============================================================================

/*
TEST 1: Node Library Drag & Drop
  1. Hover over "Send Email" node in left panel
  2. Verify colors are applied via CSS variables (not hardcoded)
  3. Drag "Send Email" to center canvas
  4. VERIFY: Blue node appears on canvas (--node-action token)
  
TEST 2: Light/Dark Theme Toggle
  1. Use theme toggle button in TopBar (if visible) or DevTools
  2. Toggle between light and dark mode
  3. VERIFY: Node colors change correctly (token values update)
  4. VERIFY: All text colors update (dark mode text lighter)
  
TEST 3: Node Configuration
  1. Click the "Send Email" node on canvas
  2. VERIFY: NodeConfigDrawer slides in from right (not popover)
  3. Edit "Action Type" dropdown → "Send Email"
  4. Edit "Recipient" field → test@example.com
  5. Click "Save"
  6. VERIFY: Config drawer closes, node data persists in state

TEST 4: Flow Persistence (localStorage)
  1. Create flow with 3 nodes
  2. Connect nodes with edges
  3. Click "Save" button in header
  4. Open browser DevTools → Storage → localStorage
  5. VERIFY: "aio_flows" key exists with JSON structure
  6. Refresh page
  7. VERIFY: All nodes and edges reload from localStorage

TEST 5: Flow Metadata
  1. Right panel shows flow name: "Untitled Flow"
  2. Click pencil icon next to name
  3. Edit to "My Test Flow"
  4. Click Save
  5. VERIFY: Name updates in both header breadcrumb and right panel
  6. Click Activate button in header
  7. VERIFY: Status badge changes from "Draft" to "Active"

TEST 6: Socket Node Badge
  1. Drag "n8n Socket" from Sockets category to canvas
  2. VERIFY: Pink node appears (--node-socket token)
  3. VERIFY: "External" badge visible on node
  4. Click node to config
  5. VERIFY: "Tip" message about socket nodes visible

TEST 7: Breadcrumb Navigation
  1. Verify header shows "Flows / My Test Flow / Editor"
  2. Click "Flows" breadcrumb
  3. (Future: Should navigate back to flows list)

TEST 8: Canvas Controls
  1. Use mouse wheel to zoom in/out
  2. Click and drag canvas to pan
  3. Click "Controls" button (top-left) to zoom fit
  4. VERIFY: MiniMap shows all nodes with correct colors
*/

// ============================================================================
// TROUBLESHOOTING
// ============================================================================

/*
ISSUE: "Module not found: @xyflow/react"
FIX: npm install --legacy-peer-deps @xyflow/react

ISSUE: "Flows module renders blank"
CHECK:
  1. ReactFlowProvider wrapping FlowBuilder (in Flows/index.jsx)
  2. No errors in browser console
  3. FlowBuilder layout div has h-screen (height:100vh)

ISSUE: "CSS tokens not applying (hardcoded colors show)"
CHECK:
  1. --node-* tokens defined in index.css :root and html.dark sections
  2. Tailwind config includes index.css
  3. browser DevTools: Inspect element, check computed styles
  4. localStorage: any theme preference set to light/dark

ISSUE: "Drag-and-drop not working"
CHECK:
  1. onDragStart handler in NodeLibraryPanel
  2. onDragOver preventDefault in FlowBuilder
  3. onDrop handler parses 'nodeData' from drag event

ISSUE: "localStorage not persisting"
CHECK:
  1. Browser privacy settings (incognito/private mode disables localStorage)
  2. localStorage quota exceeded (clear other data)
  3. flowRepository.saveFlow() being called (check Save button click)

ISSUE: "Colors inconsistent between light/dark"
CHECK:
  1. html.dark class applied to <html> element
  2. CSS token values for dark mode are lighter shades
  3. Tailwind darkMode: 'class' in tailwind.config.js

ISSUE: "Icons not rendering in nodes"
CHECK:
  1. iconName field in nodeLibrary.js is string (e.g., 'Mail')
  2. iconRegistry includes that icon name
  3. getIconComponent(iconName) resolves correctly
  4. lucide-react import has that component

ISSUE: "FlowBuilder not mounting when activeModule === 'flows'"
CHECK:
  1. FlowsModule imported as lazy in App.jsx
  2. case 'flows' exists in renderModule() switch statement
  3. No typo in activeModule comparison
  4. Sidebar menu item has id: "flows" (matches switch case)
*/

// ============================================================================
// API INTEGRATION (FUTURE)
// ============================================================================

/*
WHEN READY TO WIRE BACKEND:

1. CREATE API ENDPOINTS
   POST   /api/flows           (create new flow)
   GET    /api/flows/{id}      (load flow by ID)
   PUT    /api/flows/{id}      (update flow)
   DELETE /api/flows/{id}      (delete flow)
   GET    /api/flows           (list all flows)

2. CREATE API REPOSITORY
   File: frontend/src/modules/Flows/utils/apiFlowRepository.js
   
   Implement same interface as LocalStorageFlowRepository:
   - getAllFlows()
   - getFlowById(id)
   - saveFlow(flow)
   - deleteFlow(id)
   - createNewFlow(name)
   
   Make HTTP calls instead of localStorage

3. SWAP IMPORTS IN FlowBuilder.jsx
   OLD: import flowRepository from './utils/flowRepository'
   NEW: import flowRepository from './utils/apiFlowRepository'
   
   No other changes needed!

4. EXAMPLE API RESPONSE
   {
     "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
     "name": "Customer Onboarding Flow",
     "status": "Active",
     "nodes": [
       { "id": "trigger-1", "type": "trigger", "position": {...}, "data": {...} },
       ...
     ],
     "edges": [
       { "id": "e1-2", "source": "trigger-1", "target": "action-1", ... },
       ...
     ],
     "createdAt": "2026-02-01T10:30:00Z",
     "updatedAt": "2026-02-01T10:30:00Z",
     "createdBy": "user@example.com",
     "lastEditedBy": "user@example.com",
     "metadata": {
       "version": 1,
       "nodeCount": 5
     }
   }
*/

// ============================================================================
// DEPLOYMENT TO PRODUCTION
// ============================================================================

/*
1. BUILD
   cd frontend
   npm run build
   
   Creates dist/ folder with optimized bundles

2. TEST BUILD
   npm run preview
   
   Runs preview server on dist/ to test production build

3. VERIFY BUNDLE SIZE
   Check that @xyflow/react didn't balloon bundle
   Look for code splitting of Flows module

4. DEPLOY
   Push dist/ to your hosting (Vercel, Netlify, custom server)

5. MONITOR
   Check browser console for errors
   Verify localStorage flows persist across sessions
   Test light/dark theme in production environment

6. ROLLBACK PLAN
   Keep n8n/Make/Latenode links available for 1-2 weeks
   If critical issue found, can restore old menu structure
   Backup localStorage data before major updates
*/

export const DEPLOYMENT_GUIDE_READY = true;
