/**
 * INTENT — Canva DOM Bridge Content Script v4.2
 *
 * Injected into Canva pages (canva.com).
 * Accurately extracts physical desktop screen coordinates of interactive elements by:
 *   - Computing exact window header offset (window.outerHeight - window.innerHeight)
 *   - Adding window.screenX and window.screenY to map viewport coords to absolute desktop space
 *   - Multiplying by devicePixelRatio for physical hardware pixels
 *   - Real-time tracking via MutationObserver
 *
 * READ-ONLY: Never moves mouse, clicks, or controls browser.
 */

'use strict';

const INTENT_WS_PORT = 18923;
const SCAN_DEBOUNCE_MS = 250;
const RECONNECT_INTERVAL_MS = 2000;

let ws = null;
let reconnectTimer = null;
let scanTimer = null;
let lastSnapshot = null;

// ── Semantic Aliases ─────────────────────────────────────────────────────────

const SEMANTIC_LABELS = {
  'bg remover': 'bg_remover',
  'background remover': 'bg_remover',
  'remove background': 'bg_remover',
  'edit photo': 'edit_photo',
  'edit image': 'edit_photo',
  'edit': 'edit_photo',
  'animate': 'animate',
  'add animation': 'animate',
  'animation': 'animate',
  'position': 'position',
  'crop': 'crop',
  'flip': 'flip',
  'transparency': 'transparency',
  'magic studio': 'magic_studio',
  'adjust': 'adjust',
  'filters': 'filters',
  'effects': 'effects',
  'fade': 'animation_fade',
  'pan': 'animation_pan',
  'rise': 'animation_rise',
};

function getSemanticId(label) {
  if (!label) return null;
  const lower = label.toLowerCase().trim();
  for (const [key, id] of Object.entries(SEMANTIC_LABELS)) {
    if (lower === key || lower.includes(key)) return id;
  }
  return null;
}

// ── Desktop Physical Coordinate Computation ─────────────────────────────────

function getPhysicalRect(el) {
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // Compute Chrome browser chrome / titlebar / tabbar height in CSS pixels
  const navHeight = Math.max(0, window.outerHeight - window.innerHeight);
  const screenLeft = window.screenX !== undefined ? window.screenX : (window.screenLeft || 0);
  const screenTop = window.screenY !== undefined ? window.screenY : (window.screenTop || 0);

  // Absolute desktop coordinates in CSS pixels
  const desktopCssX = screenLeft + rect.left;
  const desktopCssY = screenTop + navHeight + rect.top;

  return {
    // Physical hardware pixels (aligned with Windows OS desktop screen space)
    x: Math.round(desktopCssX * dpr),
    y: Math.round(desktopCssY * dpr),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
    // Viewport-relative for reference
    viewportX: Math.round(rect.left),
    viewportY: Math.round(rect.top),
    viewportWidth: Math.round(rect.width),
    viewportHeight: Math.round(rect.height),
    navHeight,
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

function getLabel(el) {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.getAttribute('data-tooltip') ||
    el.innerText?.trim().substring(0, 80) ||
    el.textContent?.trim().substring(0, 80) ||
    ''
  );
}

// ── Element Scanner ─────────────────────────────────────────────────────────

function scanElements() {
  const elements = [];
  const seen = new Set();

  const selectors = [
    '[role="button"][aria-label]',
    'button[aria-label]',
    'button',
    '[role="button"]',
    '[role="tab"][aria-label]',
    '[role="menuitem"][aria-label]',
  ];

  for (const selector of selectors) {
    try {
      const found = document.querySelectorAll(selector);
      for (const el of found) {
        if (seen.has(el)) continue;
        if (!isVisible(el)) continue;

        const label = getLabel(el);
        if (!label || label.length < 2) continue;

        seen.add(el);
        const rect = getPhysicalRect(el);

        // Filter out full screen containers
        if (rect.viewportWidth > window.innerWidth * 0.70 && rect.viewportHeight > window.innerHeight * 0.70) continue;
        if (rect.width <= 4 || rect.height <= 4) continue;

        const semanticId = getSemanticId(label);
        const role = el.getAttribute('role') || el.tagName.toLowerCase();

        elements.push({
          id: `dom_${elements.length}`,
          source: 'dom_bridge',
          label,
          semanticId,
          role,
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          viewportBounds: {
            x: rect.viewportX,
            y: rect.viewportY,
            width: rect.viewportWidth,
            height: rect.viewportHeight,
          },
          visible: true,
          enabled: !el.hasAttribute('disabled') && !el.getAttribute('aria-disabled'),
          confidence: 0.99,
        });
      }
    } catch (e) { /* ignore */ }
  }

  return elements;
}

// ── Build and Send Snapshot ───────────────────────────────────────────────────

function buildSnapshot() {
  const elements = scanElements();

  return {
    type: 'canva_dom_snapshot',
    timestamp: Date.now(),
    url: window.location.href,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    screenOffset: {
      x: window.screenX || window.screenLeft || 0,
      y: window.screenY || window.screenTop || 0,
      navHeight: Math.max(0, window.outerHeight - window.innerHeight),
    },
    devicePixelRatio: window.devicePixelRatio || 1,
    elements,
  };
}

function sendSnapshot() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  try {
    const snapshot = buildSnapshot();
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
      sendSnapshot();
    };

    ws.onclose = () => {
      ws = null;
      if (!reconnectTimer) {
        reconnectTimer = setInterval(connectWS, RECONNECT_INTERVAL_MS);
      }
    };

    ws.onerror = () => {};

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

// ── MutationObserver ──────────────────────────────────────────────────────────

const observer = new MutationObserver((mutations) => {
  const relevant = mutations.some(m =>
    m.type === 'childList' && m.addedNodes.length > 0 ||
    m.type === 'attributes' && ['aria-label', 'aria-selected', 'class'].includes(m.attributeName)
  );
  if (relevant) scheduleScan();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['aria-label', 'aria-selected', 'class'],
});

connectWS();
setInterval(sendSnapshot, 2000);
console.log('[INTENT Bridge v4.2] Canva DOM bridge active with absolute desktop coordinate mapping');
