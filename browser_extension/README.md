/**
 * INTENT Browser Extension — Installation Guide (README)
 *
 * STEP-BY-STEP INSTALLATION:
 *
 * For Google Chrome:
 * 1. Open Chrome and navigate to: chrome://extensions/
 * 2. Enable "Developer mode" (toggle in top right)
 * 3. Click "Load unpacked"
 * 4. Select this folder: /browser_extension/
 * 5. The INTENT Bridge extension will appear with a checkmark
 *
 * For Microsoft Edge:
 * 1. Open Edge and navigate to: edge://extensions/
 * 2. Enable "Developer mode" (toggle in bottom left)
 * 3. Click "Load unpacked"
 * 4. Select this folder: /browser_extension/
 * 5. The INTENT Bridge extension will appear with a checkmark
 *
 * WHAT IT DOES:
 * - Reads Canva's DOM to extract visible UI element positions (aria-labels, buttons, controls)
 * - Sends element coordinates to the INTENT desktop app via WebSocket (localhost:18923)
 * - Provides accurate, real-time physical coordinates for INTENT's cursor placement
 * - Tracks Canva UI state changes in real-time
 *
 * WHAT IT DOES NOT DO:
 * - Never clicks, types, moves the mouse, or performs any action
 * - Never reads passwords, form data, or personal information
 * - Never communicates with any external server (only localhost:18923)
 * - Read-only DOM observer only
 *
 * USAGE:
 * 1. Install the extension
 * 2. Start INTENT desktop app (npm run dev or launch the packaged app)
 * 3. Open Canva in Chrome/Edge (canva.com)
 * 4. The extension automatically connects and begins providing element data
 * 5. A "Connected" status appears in the INTENT diagnostics panel
 */
