# Implementation Plan - PromptFlow Bridge

The PromptFlow Bridge is a productivity tool that bridges the gap between the official ChatGPT desktop application and IDE-based AI agents (Antigravity, OpenCode, VSCode). It automates the process of "Meta-Prompting" in ChatGPT and delivering the refined output directly to the developer's agent.

## User Review Required

> [!IMPORTANT]
> This solution relies on **Windows UI Automation** via PowerShell to interact with the ChatGPT desktop app. This requires:
> 1. The ChatGPT app to be installed and logged in.
> 2. The app window to be accessible (not minimized to tray in a hidden state, though the script will try to restore it).
> 3. Permission for the bridge server to execute PowerShell scripts.

## Proposed Changes

### 1. Bridge Server (Node.js)
A lightweight local server to handle the automation lifecycle and serve the frontend.
- **Location**: `C:\Users\besta\.gemini\antigravity\scratch\prompt-bridge\server`
- **Features**:
  - Endpoint for **Desktop Automation** (PowerShell).
  - Endpoint for **Web Capture** (receiving data from a browser bookmarklet).
  - File writer for IDE integration (Antigravity/OpenCode inbox).

### 2. Frontend (Vite + React)
A premium, "Control Room" style dashboard.
- **Location**: `C:\Users\besta\.gemini\antigravity\scratch\prompt-bridge\client`
- **Aesthetics**:
  - Dark theme with glassmorphism.
  - Animated glowing borders.
  - Interactive "Signal" indicators for ChatGPT and IDE status.

### 3. Automation Engine (PowerShell)
The core logic for interacting with the ChatGPT desktop app.
- **Script**: `bridge.ps1`
- **Workflow**:
  - Finds "ChatGPT" window.
  - Uses `SendKeys` to paste input.
  - Monitors clipboard change or waits for response completion.
  - Extracts the generated prompt.

### 4. Web Capture (Optional - "The Simple Way")
Instead of full desktop automation, the app provides a **Bookmarklet** (a "magic" button in your browser bookmarks).
- When you are on `chatgpt.com`, click the bookmarklet.
- It automatically grabs the last response and "beams" it to the Bridge App.

### 5. IDE Integration
- **Antigravity/OpenCode**: Writes to `inbox.md`.
- **VSCode**: Optional clipboard sync or file-based triggers.

## Verification Plan

### Automated Tests
- Server health check endpoint.
- Script dry-run (focusing window without typing).

### Manual Verification
1. Launch the PromptFlow Bridge.
2. Open ChatGPT Desktop App.
3. Type a high-level intent in the Bridge UI.
4. Observe the Bridge focusing ChatGPT, typing, and retrieving the result.
5. Verify the result appears in the IDE agent's context.
