// ==========================================================================
// INTENT // INTERACTIVE TYPEWRITER SIMULATION SCRIPT
// ==========================================================================

// ==========================================================================
// EMAIL GATE CONFIG — Replace these values with your EmailJS credentials
// Steps: https://emailjs.com → Connect Gmail → Create Template → Copy IDs
// ==========================================================================
const EMAILJS_CONFIG = {
  publicKey:   'YOUR_EMAILJS_PUBLIC_KEY',   // EmailJS → Account → Public Key
  serviceId:   'YOUR_SERVICE_ID',           // EmailJS → Email Services → Service ID
  templateId:  'YOUR_TEMPLATE_ID',          // EmailJS → Email Templates → Template ID
  downloadUrl: 'https://github.com/Devsrinivas69/INTENT/releases/latest/download/INTENT-Setup-1.0.0.exe'
};

// ==========================================================================
// ANALYTICS PIXEL — fires a lightweight hit on every successful link send
// Replace PIXEL_URL with your own analytics endpoint (e.g. a 1×1 GIF on
// your server, a Cloudflare Worker, or a free service like Plausible Goals).
// ==========================================================================
const ANALYTICS_PIXEL_URL = 'https://YOUR_ANALYTICS_ENDPOINT/pixel.gif';

function fireDownloadAnalyticsPixel(email) {
  try {
    const img = new Image();
    img.src = `${ANALYTICS_PIXEL_URL}?event=download_link_sent&ts=${Date.now()}`;
    // Fire-and-forget — never blocks the user flow
    console.info('[ANALYTICS] Download pixel fired for domain:', email.split('@')[1]);
  } catch (e) {
    console.warn('[ANALYTICS] Pixel fire failed (non-critical):', e);
  }
}

// ==========================================================================
// EMAIL GATE MODAL CONTROLLER
// ==========================================================================
(function initEmailGate() {
  let emailJSReady = false;

  function ensureEmailJSInit() {
    if (emailJSReady) return true;
    if (typeof emailjs === 'undefined') {
      console.error('[EMAIL GATE] EmailJS SDK not loaded.');
      return false;
    }
    emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
    emailJSReady = true;
    return true;
  }

  function validateEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str.trim());
  }

  function getFirstName(email) {
    const prefix = email.split('@')[0];
    return prefix.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  const STATES = ['emailGateIdle', 'emailGateLoading', 'emailGateSuccess', 'emailGateErrorState'];

  function showState(stateId) {
    STATES.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = (id === stateId) ? '' : 'none';
    });
  }

  function openEmailGateModal() {
    const modal = document.getElementById('emailGateModal');
    if (!modal) return;
    showState('emailGateIdle');
    const input     = document.getElementById('emailGateInput');
    const errorEl   = document.getElementById('emailGateError');
    const submitBtn = document.getElementById('emailGateSubmitBtn');
    if (input)     { input.value = '';    input.disabled = false; }
    if (errorEl)   { errorEl.textContent = ''; }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '[ SEND ME THE DOWNLOAD LINK \u2192 ]'; }
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => { if (input) input.focus(); }, 80);
  }

  function closeEmailGateModal() {
    const modal = document.getElementById('emailGateModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  function sendDownloadEmail(userEmail) {
    if (!ensureEmailJSInit()) { showState('emailGateErrorState'); return; }
    showState('emailGateLoading');
    emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
      to_email:      userEmail,
      user_name:     getFirstName(userEmail),
      download_link: EMAILJS_CONFIG.downloadUrl
    })
    .then(() => {
      const successMsg = document.getElementById('emailGateSuccessMsg');
      if (successMsg) successMsg.textContent = `Check your inbox \u2014 download link sent to ${userEmail}`;
      showState('emailGateSuccess');
      fireDownloadAnalyticsPixel(userEmail);
    })
    .catch((err) => {
      console.error('[EMAIL GATE] Send failed:', err);
      showState('emailGateErrorState');
    });
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const input     = document.getElementById('emailGateInput');
    const errorEl   = document.getElementById('emailGateError');
    const submitBtn = document.getElementById('emailGateSubmitBtn');
    const email     = input ? input.value.trim() : '';
    if (!validateEmail(email)) {
      if (errorEl) errorEl.textContent = '\u26a0 Please enter a valid email address.';
      if (input)   input.focus();
      return;
    }
    if (errorEl)   errorEl.textContent = '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '[ SENDING... ]'; }
    if (input)     input.disabled = true;
    sendDownloadEmail(email);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const modal          = document.getElementById('emailGateModal');
    const overlay        = document.getElementById('emailGateOverlay');
    const closeBtn       = document.getElementById('closeEmailGateBtn');
    const form           = document.getElementById('emailGateForm');
    const retryBtn       = document.getElementById('emailGateRetryBtn');
    const retryErrBtn    = document.getElementById('emailGateRetryErrBtn');
    const navDownloadBtn = document.getElementById('navDownloadBtn');

    document.querySelectorAll('.open-email-gate').forEach(btn => {
      btn.addEventListener('click', openEmailGateModal);
    });
    if (navDownloadBtn) navDownloadBtn.addEventListener('click', openEmailGateModal);
    if (closeBtn)       closeBtn.addEventListener('click', closeEmailGateModal);
    if (overlay)        overlay.addEventListener('click', closeEmailGateModal);
    if (form)           form.addEventListener('submit', handleFormSubmit);
    if (retryBtn)       retryBtn.addEventListener('click', () => showState('emailGateIdle'));
    if (retryErrBtn)    retryErrBtn.addEventListener('click', () => showState('emailGateIdle'));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
        closeEmailGateModal();
      }
    });
  });
})();

const SCENARIOS = {
  canva: {
    prompt: 'user: "remove the background of this photo in canva"',
    steps: [
      { tag: 'INTENT_PARSER', msg: 'Classified intent: canva.remove_background (confidence: 0.98)' },
      { tag: 'UIA_DETECTOR', msg: 'Canva Chrome viewport identified (hwnd=0x40192, 1920x1080@1.25x)' },
      { tag: 'OCR_SCAN', msg: 'Located text candidate "Edit Photo" at pixel (x: 412, y: 154)' },
      { tag: 'TARGET_LOCK', msg: 'Holographic highlight rendered -> Level 1 / 3 locked' },
      { tag: 'STATE_CHECK', msg: 'Magic Studio sidebar opened -> Level 2 / 3 verified' },
      { tag: 'VISION_AI', msg: 'Gemini Vision confirms BG Remover complete (confidence: 0.96)' },
      { tag: 'COMPLETE', msg: 'Workflow finished successfully in 410ms. All proofs recorded.' }
    ]
  },
  excel: {
    prompt: 'user: "calculate autosum for this column of sales numbers in Excel"',
    steps: [
      { tag: 'INTENT_PARSER', msg: 'Classified intent: excel.autosum (confidence: 0.99)' },
      { tag: 'UIA_DETECTOR', msg: 'Excel Ribbon window found (hwnd=0x1804B, Microsoft Excel 365)' },
      { tag: 'OCR_SCAN', msg: 'Located "AutoSum" in Home > Editing ribbon at (x: 1340, y: 88)' },
      { tag: 'TARGET_LOCK', msg: 'Projecting cursor target at ribbon button AutoSum' },
      { tag: 'STATE_CHECK', msg: 'Sum formula generated in active cell -> Level 2 / 2 verified' },
      { tag: 'COMPLETE', msg: 'AutoSum computation locked. Result calculated.' }
    ]
  },
  word: {
    prompt: 'user: "format this selected paragraph as Heading 1 in Word"',
    steps: [
      { tag: 'INTENT_PARSER', msg: 'Classified intent: word.format_heading (confidence: 0.97)' },
      { tag: 'UIA_DETECTOR', msg: 'Active document window detected (hwnd=0x0219A, WINWORD.EXE)' },
      { tag: 'COORDINATE_MAP', msg: 'Style Gallery "Heading 1" resolved at (x: 742, y: 92)' },
      { tag: 'TARGET_LOCK', msg: 'Bounding box active around Heading 1 style chip' },
      { tag: 'STATE_CHECK', msg: 'Paragraph style updated to Heading 1. Verification passed.' },
      { tag: 'COMPLETE', msg: 'Heading 1 formatting completed.' }
    ]
  },
  chrome: {
    prompt: 'user: "open a new tab and search for flight tickets"',
    steps: [
      { tag: 'INTENT_PARSER', msg: 'Classified intent: chrome.open_new_tab (confidence: 0.99)' },
      { tag: 'NATIVE_HOST', msg: 'Dispatched through Chrome Native Messaging Bridge' },
      { tag: 'DOM_BRIDGE', msg: 'Tab created at index 4 -> omnibox focused' },
      { tag: 'STATE_CHECK', msg: 'Navigation state confirmed. Focus ready for input.' },
      { tag: 'COMPLETE', msg: 'Browser tab ready.' }
    ]
  }
};

let currentScenario = 'canva';
let activeTimeout = null;

function getCurrentTime() {
  const now = new Date();
  return now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
}

function runSimulation(scenarioKey) {
  if (activeTimeout) {
    clearTimeout(activeTimeout);
  }

  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) return;

  currentScenario = scenarioKey;
  const terminal = document.getElementById('terminalOutput');
  const promptEl = document.getElementById('currentPromptText');
  const statusEl = document.getElementById('termStatus');

  if (promptEl) {
    promptEl.textContent = scenario.prompt;
  }
  if (statusEl) {
    statusEl.textContent = 'STATUS: EXECUTING';
  }

  // Clear previous lines
  while (terminal.firstChild) {
    terminal.removeChild(terminal.firstChild);
  }

  let stepIdx = 0;

  function renderNextStep() {
    if (stepIdx >= scenario.steps.length) {
      if (statusEl) statusEl.textContent = 'STATUS: COMPLETED';
      return;
    }

    const step = scenario.steps[stepIdx];
    const line = document.createElement('div');
    line.className = 'log-line';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${getCurrentTime()}]`;

    const tagSpan = document.createElement('span');
    tagSpan.className = 'log-tag';
    tagSpan.textContent = `[${step.tag}]`;

    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';
    msgSpan.textContent = step.msg;

    line.appendChild(timeSpan);
    line.appendChild(tagSpan);
    line.appendChild(msgSpan);

    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;

    stepIdx++;
    activeTimeout = setTimeout(renderNextStep, 240);
  }

  renderNextStep();
}

document.addEventListener('DOMContentLoaded', () => {
  // Scenario Tab Listeners
  const tabs = document.querySelectorAll('.demo-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const scenario = tab.getAttribute('data-scenario');
      runSimulation(scenario);
    });
  });

  // Replay Button
  const replayBtn = document.getElementById('rerunDemoBtn');
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      runSimulation(currentScenario);
    });
  }

  // Initial simulation run
  runSimulation('canva');

  // ==========================================================================
  // FUND DEVELOPER & UPI REDIRECTION CONTROLLER (ZERO PUBLIC QR GRAPHIC)
  // ==========================================================================
  const UPI_CONFIG = {
    vpa: '8088244385-2@ybl',
    payeeName: 'K H SRINIVASA REDDY',
    baseUri: 'upi://pay?pa=8088244385-2@ybl&pn=K%20H%20SRINIVASA%20REDDY&mc=0000&mode=02&purpose=00'
  };

  const fundModal = document.getElementById('fundModal');
  const closeFundModalBtn = document.getElementById('closeFundModalBtn');
  const fundModalOverlay = document.getElementById('fundModalOverlay');
  const copyUpiBtn = document.getElementById('copyUpiBtn');
  const modalTierName = document.getElementById('modalTierName');
  const modalAmountVal = document.getElementById('modalAmountVal');
  const directUpiAppBtn = document.getElementById('directUpiAppBtn');
  const navFundDev = document.getElementById('navFundDev');

  function openFundModal(tierTitle, usd, inr) {
    if (!fundModal) return;

    if (modalTierName) modalTierName.textContent = tierTitle || 'DEVELOPER CONTRIBUTION';
    if (modalAmountVal) modalAmountVal.textContent = `$${usd} (approx. ₹${inr})`;

    // Construct UPI Deep Link Intent URL with amount
    const upiUriWithAmount = inr
      ? `upi://pay?pa=${encodeURIComponent(UPI_CONFIG.vpa)}&pn=${encodeURIComponent(UPI_CONFIG.payeeName)}&am=${encodeURIComponent(inr)}&cu=INR&mc=0000&mode=02&purpose=00`
      : UPI_CONFIG.baseUri;

    if (directUpiAppBtn) {
      directUpiAppBtn.setAttribute('href', upiUriWithAmount);
    }

    // Open modal
    fundModal.classList.add('open');
    fundModal.setAttribute('aria-hidden', 'false');

    // Trigger immediate browser redirect to native UPI app
    try {
      window.location.href = upiUriWithAmount;
    } catch (e) {
      console.warn('Direct UPI redirect error, modal remains open for manual copy:', e);
    }
  }

  function closeFundModal() {
    if (!fundModal) return;
    fundModal.classList.remove('open');
    fundModal.setAttribute('aria-hidden', 'true');
  }

  // Tier buttons click
  const tierButtons = document.querySelectorAll('.fund-tier-btn');
  tierButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const title = btn.getAttribute('data-title') || 'AI COMPUTE CREDITS';
      const usd = btn.getAttribute('data-usd') || '10.00';
      const inr = btn.getAttribute('data-inr') || '800';
      openFundModal(title, usd, inr);
    });
  });

  // Nav Fund Developer Link
  if (navFundDev) {
    navFundDev.addEventListener('click', (e) => {
      e.preventDefault();
      const supportSec = document.getElementById('support');
      if (supportSec) {
        supportSec.scrollIntoView({ behavior: 'smooth' });
      }
      openFundModal('AI COMPUTE CREDITS', '10.00', '800');
    });
  }

  // Direct UPI link triggers in alternative bar
  const directUpiTriggers = document.querySelectorAll('.direct-upi-trigger');
  directUpiTriggers.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openFundModal('OPEN CONTRIBUTION', '10.00', '800');
    });
  });

  // Close handlers
  if (closeFundModalBtn) closeFundModalBtn.addEventListener('click', closeFundModal);
  if (fundModalOverlay) fundModalOverlay.addEventListener('click', closeFundModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fundModal && fundModal.classList.contains('open')) {
      closeFundModal();
    }
  });

  // 1-Click UPI Copy Handler
  if (copyUpiBtn) {
    copyUpiBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(UPI_CONFIG.vpa).then(() => {
        const originalText = copyUpiBtn.textContent;
        copyUpiBtn.textContent = '[ ✓ COPIED TO CLIPBOARD! ]';
        copyUpiBtn.classList.add('copied');
        setTimeout(() => {
          copyUpiBtn.textContent = originalText;
          copyUpiBtn.classList.remove('copied');
        }, 2200);
      }).catch(() => {
        // Fallback
        prompt('Copy UPI ID manually:', UPI_CONFIG.vpa);
      });
    });
  }
});
