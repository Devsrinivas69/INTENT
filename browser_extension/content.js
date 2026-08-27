/**
 * INTENT — Canva DOM Bridge Content Script
 *
 * Injected into Canva pages (canva.com).
 * Extracts physical screen coordinates of interactive elements using:
 *   - getBoundingClientRect() + devicePixelRatio for physical pixels
 *   - aria-label, role, title, accessible name for semantic identification
 *   - MutationObserver for real-time tracking of Canva UI state changes
 *   - Selection state detection via Canva's purple outline class changes
 *
 * Sends element snapshots to INTENT desktop app via WebSocket (port 18923).
 *
 * CRITICAL: This script does NOT move mouse, click, type, or simulate any action.
 * It is READ-ONLY. It only reads DOM state and reports coordinates.
 */

'use strict';

const INTENT_WS_PORT = 18923;
const SCAN_DEBOUNCE_MS = 300;
const RECONNECT_INTERVAL_MS = 2000;

let ws = null;
let reconnectTimer = null;
let scanTimer = null;
let lastSnapshot = null;

// ── Semantic Aliases (matching knowledge/canva.json) ─────────────────────────

const SEMANTIC_LABELS = {
  'edit photo': 'edit_photo',
  'edit image': 'edit_photo',
  'edit': 'edit_photo',
  'animate': 'animate',
  'add animation': 'animate',
  'animation': 'animate',
  'background remover': 'bg_remover',
  'bg remover': 'bg_remover',
  'remove background': 'bg_remover',
  'position': 'position',
  'crop': 'crop',
  'flip': 'flip',
  'transparency': 'transparency',
  'filters': 'filters',
  'adjust': 'adjust',
  'effects': 'effects',
  'magic studio': 'magic_studio',
  'fade': 'animation_fade',
  'pan': 'animation_pan',
  'rise': 'animation_rise',
  'pop': 'animation_pop',
  'wipe': 'animation_wipe',
  'breathe': 'animation_breathe',
};

function getSemanticId(label) {
  if (!label) return null;
  const lower = label.toLowerCase().trim();
  for (const [key, id] of Object.entries(SEMANTIC_LABELS)) {
    if (lower === key || lower.includes(key)) return id;
  }
  return null;
}

// ── Physical Bounding Rect (accounts for devicePixelRatio, scroll, zoom) ─────

function getPhysicalRect(el) {
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // getBoundingClientRect() is in CSS pixels. Convert to physical screen pixels.
  return {
    x: Math.round((rect.left + window.scrollX) * dpr),
    y: Math.round((rect.top + window.scrollY) * dpr),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
    // Also store viewport-relative (CSS) coords for debugging
    cssX: Math.round(rect.left),
    cssY: Math.round(rect.top),
    cssWidth: Math.round(rect.width),
    cssHeight: Math.round(rect.height),
  };
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.bottom <= 0 || rect.right <= 0) return false;
  if (rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

function isInteractive(el) {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || '';
  if (['button', 'a', 'input', 'select', 'textarea'].includes(tag)) return true;
  if (['button', 'menuitem', 'tab', 'option', 'checkbox', 'radio', 'link', 'combobox'].includes(role)) return true;
  if (el.getAttribute('tabindex') !== null) return true;
  if (el.onclick || el.getAttribute('data-testid')) return true;
  return false;
}

function getLabel(el) {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.getAttribute('data-tooltip') ||
    el.getAttribute('aria-describedby') ||
    el.textContent?.trim().substring(0, 80) ||
    ''
  );
}

// ── Canvas Selection State Detection ─────────────────────────────────────────

function detectSelectionState() {
  // Canva wraps selected elements in a container with a specific data attribute
  // or adds a selection ring overlay. Look for indicators in the DOM.
  const selectionIndicators = [
    // Canva adds data-selection or similar attributes
    '[data-element-selected="true"]',
    '[aria-selected="true"]',
    '[data-focused="true"]',
  ];

  for (const selector of selectionIndicators) {
    try {
      const found = document.querySelector(selector);
      if (found && isVisible(found)) {
        const rect = getPhysicalRect(found);
        return {
          elementSelected: true,
          bounds: rect,
          label: getLabel(found),
        };
      }
    } catch (e) { /* ignore */ }
  }

  return { elementSelected: false };
}

// ── Full Element Scan ─────────────────────────────────────────────────────────

function scanElements() {
  const elements = [];
  const seen = new Set();

  // Priority query selectors for Canva's key controls
  const prioritySelectors = [
    // Toolbar buttons (aria-label is most reliable for Canva)
    '[role="button"][aria-label]',
    'button[aria-label]',
    '[role="menuitem"][aria-label]',
    '[role="tab"][aria-label]',
    // Any button or interactive with a label
    '[aria-label]:not(div[aria-label=""]):not(span[aria-label=""])',
  ];

  for (const selector of prioritySelectors) {
    try {
      const found = document.querySelectorAll(selector);
      for (const el of found) {
        if (seen.has(el)) continue;
        if (!isVisible(el)) continue;

        const label = getLabel(el);
        if (!label || label.length < 2) continue;

        seen.add(el);
        const rect = getPhysicalRect(el);

        // Skip giant containers (> 70% of viewport)
        if (rect.cssWidth > window.innerWidth * 0.70 && rect.cssHeight > window.innerHeight * 0.70) continue;
        // Skip invisible size
        if (rect.width <= 4 || rect.height <= 4) continue;

        const semanticId = getSemanticId(label);
        const role = el.getAttribute('role') || el.tagName.toLowerCase();

        elements.push({
          id: `dom_${elements.length}`,
          source: 'dom',
          label,
          semanticId,
          role,
          tag: el.tagName.toLowerCase(),
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          cssBounds: {
            x: rect.cssX,
            y: rect.cssY,
            width: rect.cssWidth,
            height: rect.cssHeight,
          },
          visible: true,
          enabled: !el.hasAttribute('disabled') && !el.getAttribute('aria-disabled'),
          confidence: 0.98,
        });
      }
    } catch (e) { /* ignore */ }
  }

  return elements;
}

// ── Build and Send Snapshot ───────────────────────────────────────────────────

function buildSnapshot() {
  const elements = scanElements();
  const selection = detectSelectionState();

  return {
    type: 'canva_dom_snapshot',
    timestamp: Date.now(),
    url: window.location.href,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    devicePixelRatio: window.devicePixelRatio || 1,
    scrollOffset: {
      x: window.scrollX,
      y: window.scrollY,
    },
    selectionState: selection,
    elements,
  };
}

function sendSnapshot() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  try {
    const snapshot = buildSnapshot();

    // Only send if meaningfully different from last snapshot
    const snapshotStr = JSON.stringify(snapshot.elements.map(e => e.label).sort());
    if (snapshotStr === lastSnapshot) return;
    lastSnapshot = snapshotStr;

    ws.send(JSON.stringify(snapshot));
  } catch (e) {
    console.warn('[INTENT Bridge] Send error:', e);
  }
}

function scheduleScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(sendSnapshot, SCAN_DEBOUNCE_MS);
}

// ── WebSocket Connection ──────────────────────────────────────────────────────

function connectWS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  try {
    ws = new WebSocket(`ws://localhost:${INTENT_WS_PORT}`);

    ws.onopen = () => {
      console.log('[INTENT Bridge] Connected to INTENT desktop app');
      if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
      // Send initial snapshot immediately
      sendSnapshot();
    };

    ws.onclose = () => {
      ws = null;
      if (!reconnectTimer) {
        reconnectTimer = setInterval(connectWS, RECONNECT_INTERVAL_MS);
      }
    };

    ws.onerror = () => {
      // Silently fail — INTENT may not be running
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'request_snapshot') {
          sendSnapshot();
        }
      } catch (e) { /* ignore */ }
    };
  } catch (e) {
    if (!reconnectTimer) {
      reconnectTimer = setInterval(connectWS, RECONNECT_INTERVAL_MS);
    }
  }
}

// ── MutationObserver — Track DOM Changes ──────────────────────────────────────

const observer = new MutationObserver((mutations) => {
  // Only react to meaningful DOM changes (not text updates within cells)
  const relevant = mutations.some(m =>
    m.type === 'childList' && m.addedNodes.length > 0 ||
    m.type === 'attributes' && ['aria-label', 'aria-selected', 'data-element-selected', 'aria-hidden'].includes(m.attributeName)
  );
  if (relevant) scheduleScan();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['aria-label', 'aria-selected', 'data-element-selected', 'aria-hidden', 'class'],
});

// ── Init ─────────────────────────────────────────────────────────────────────

connectWS();

// Periodic heartbeat scan (handles cases where MutationObserver misses changes)
setInterval(sendSnapshot, 2000);

console.log('[INTENT Bridge] Canva DOM bridge active');
