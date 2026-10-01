/**
 * INTENT Website Backend — Google Apps Script
 * =============================================================================
 * PASTE THIS CODE, THEN:
 *   1. In the function selector dropdown (top center), choose  testSetup
 *   2. Click ▶ Run  →  click "Review Permissions" → choose your Gmail account
 *      → click "Advanced" → "Go to INTENT (unsafe)" → Allow
 *   3. Check Execution Log — should say "testSetup OK"
 *   4. Deploy → Manage Deployments → Edit (pencil icon) → Version: New version → Deploy
 *   DONE. Emails will now send correctly.
 * =============================================================================
 */

const DOWNLOAD_URL = 'https://github.com/Devsrinivas69/INTENT/releases/latest/download/INTENT-Setup-1.0.0.exe';
const ADMIN_EMAIL  = 'reddykph@gmail.com';
const ADMIN_KEY    = 'Reddy2005@clk';
const SHEET_NAME   = 'Registrations';

// ── RUN THIS ONCE to authorize Gmail + Sheets permissions ────────────────────
function testSetup() {
  // 1. Test Gmail permission
  GmailApp.sendEmail(
    ADMIN_EMAIL,
    '[INTENT Admin] Authorization Test — Setup Complete',
    'GmailApp authorization is working.\n\nYour INTENT backend is ready to send download links.\n\nURL: ' + DOWNLOAD_URL
  );
  Logger.log('testSetup OK — Gmail authorized and working.');

  // 2. Test Sheets permission
  const sheet = getSheet();
  Logger.log('testSetup OK — Sheet "' + sheet.getName() + '" ready. Row count: ' + sheet.getLastRow());
}

// ── POST /exec — register email + send download link ────────────────────────
function doPost(e) {
  try {
    if (!e) {
      Logger.log('doPost was invoked directly from the editor without an HTTP event object. To test setup and authorize permissions, run testSetup() instead.');
      return jsonOut({ success: false, error: 'No HTTP event payload. Run testSetup() in the editor to authorize and test.' });
    }

    let email = '', source = 'website', ua = '';

    // Priority 1: form-encoded body (from browser no-cors fetch)
    if (e.parameter && e.parameter.email) {
      email  = String(e.parameter.email).trim().toLowerCase();
      source = String(e.parameter.source || 'website').trim();
      ua     = String(e.parameter.ua     || '').substring(0, 300);
    }
    // Priority 2: raw post body (JSON or URL-encoded text)
    else if (e.postData && e.postData.contents) {
      const raw = e.postData.contents;
      // Try JSON first
      try {
        const j = JSON.parse(raw);
        email  = String(j.email  || '').trim().toLowerCase();
        source = String(j.source || 'website').trim();
        ua     = String(j.ua     || '').substring(0, 300);
      } catch (_) {
        // Try URL-encoded
        raw.split('&').forEach(pair => {
          const [k, v] = pair.split('=').map(decodeURIComponent);
          if (k === 'email')  email  = String(v || '').trim().toLowerCase();
          if (k === 'source') source = String(v || 'website').trim();
          if (k === 'ua')     ua     = String(v || '').substring(0, 300);
        });
      }
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return jsonOut({ success: false, error: 'Invalid email: ' + email });
    }

    const sheet  = getSheet();
    const exists = isAlreadyRegistered(sheet, email);

    if (!exists) {
      sheet.appendRow([new Date().toISOString(), email, source, ua]);
    }

    // Send download link to user (always, even duplicate)
    GmailApp.sendEmail(
      email,
      '[ INTENT ] Your Download Link is Ready',
      buildUserEmail(email),
      { name: 'Srinivas Reddy — INTENT Developer' }
    );

    // Notify admin (new registrations only)
    if (!exists) {
      GmailApp.sendEmail(
        ADMIN_EMAIL,
        '[INTENT Admin] New Registration: ' + email,
        'New download registration\n\nEmail  : ' + email +
        '\nTime   : ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) +
        '\nSource : ' + source
      );
    }

    return jsonOut({ success: true, isNew: !exists });
  } catch (err) {
    Logger.log('doPost ERROR: ' + err.toString());
    return jsonOut({ success: false, error: String(err) });
  }
}

// ── GET /exec?key=<ADMIN_KEY> — admin analytics ──────────────────────────────
function doGet(e) {
  if (!e) {
    Logger.log('doGet was invoked directly from the editor without an HTTP event object.');
    return jsonOut({ success: false, error: 'No HTTP event payload.' });
  }

  const key = String((e.parameter && e.parameter.key) || '');
  if (key !== ADMIN_KEY) {
    return jsonOut({ success: false, error: 'Unauthorized' });
  }

  const sheet   = getSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return jsonOut({ success: true, total: 0, today: 0, data: [] });
  }

  const rows     = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const todayStr = new Date().toISOString().substring(0, 10);

  const data = rows
    .filter(r => r[0] && r[1])
    .map(r => ({
      timestamp : String(r[0]),
      email     : String(r[1]),
      source    : String(r[2] || 'website'),
      ua        : String(r[3] || '')
    }));

  const today = data.filter(r => String(r.timestamp).startsWith(todayStr)).length;
  data.reverse(); // newest first

  return jsonOut({ success: true, total: data.length, today: today, data: data });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSheet() {
  let ss = null;

  // Case 1: Script opened from inside a Google Sheet (Extensions → Apps Script)
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (_) {}

  // Case 2: Standalone script — reuse previously created spreadsheet
  if (!ss) {
    const props    = PropertiesService.getScriptProperties();
    const savedId  = props.getProperty('SPREADSHEET_ID');
    if (savedId) {
      try { ss = SpreadsheetApp.openById(savedId); } catch (_) {}
    }
  }

  // Case 3: No spreadsheet at all — create one automatically
  if (!ss) {
    ss = SpreadsheetApp.create('INTENT Email Registrations');
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    Logger.log('Created new spreadsheet: ' + ss.getUrl());
  }

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Email', 'Source', 'UserAgent']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 240);
    sheet.setColumnWidth(3, 100);
    sheet.setColumnWidth(4, 300);
  }
  return sheet;
}

function isAlreadyRegistered(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const emails = sheet.getRange(2, 2, lastRow - 1, 1).getValues().flat().map(String);
  return emails.includes(email);
}

function buildUserEmail(email) {
  return [
    'Hi there!',
    '',
    'Thanks for your interest in INTENT — the first intent-driven desktop guidance assistant for Windows.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'YOUR DIRECT DOWNLOAD LINK:',
    DOWNLOAD_URL,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '  ✓ SHA-256 Verified  |  v1.0.0  |  78 MB',
    '  ✓ Windows 10 (1903+) / Windows 11  64-bit',
    '  ✓ MIT Open Source — Free Forever',
    '',
    'SETUP IN 3 STEPS:',
    '  1. Run INTENT-Setup-1.0.0.exe',
    '  2. Get your FREE Gemini key at https://aistudio.google.com/app/apikey',
    '     (No credit card — 15 req/min free forever)',
    '  3. Press Alt+Space in INTENT, paste your key, and start talking!',
    '',
    'Zero subscriptions. Zero server hops. 100% local-first.',
    '',
    '— Srinivas Reddy | INTENT Developer',
    '  https://devsrinivas69.github.io/INTENT/',
    '  https://github.com/Devsrinivas69/INTENT',
  ].join('\n');
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
