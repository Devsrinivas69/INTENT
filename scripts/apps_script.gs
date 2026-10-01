/**
 * INTENT Website Backend — Google Apps Script
 * =============================================================================
 * SETUP (one-time, ~3 minutes):
 *   1. Open Google Sheets: https://sheets.google.com → create a new blank sheet
 *   2. In that sheet: Extensions → Apps Script
 *   3. Delete all default code, paste this entire file
 *   4. Click Deploy → New Deployment
 *      Type: Web App | Execute as: Me | Who has access: Anyone
 *   5. Click Deploy → COPY the Web App URL
 *   6. Paste that URL into website/script.js  as  APPS_SCRIPT_URL
 * =============================================================================
 */

const DOWNLOAD_URL  = 'https://github.com/Devsrinivas69/INTENT/releases/latest/download/INTENT-Setup-1.0.0.exe';
const ADMIN_EMAIL   = 'reddykph@gmail.com';
const ADMIN_KEY     = 'Reddy2005@clk';
const SHEET_NAME    = 'Registrations';

// POST /exec — register email, send download link via Gmail ──────────────────
function doPost(e) {
  try {
    const email  = String(e.parameter.email  || '').trim().toLowerCase();
    const source = String(e.parameter.source || 'website').trim();
    const ua     = String(e.parameter.ua     || '').substring(0, 300);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return jsonOut({ success: false, error: 'Invalid email' });
    }

    const sheet  = getSheet();
    const exists = isAlreadyRegistered(sheet, email);

    if (!exists) {
      sheet.appendRow([new Date().toISOString(), email, source, ua]);
    }

    // Always send download link (even on duplicate)
    GmailApp.sendEmail(
      email,
      '[ INTENT ] Your Download Link is Ready',
      buildUserEmail(email),
      { name: 'Srinivas Reddy — INTENT Developer' }
    );

    // Admin notification only for new registrations
    if (!exists) {
      GmailApp.sendEmail(
        ADMIN_EMAIL,
        '[INTENT Admin] New Registration: ' + email,
        'New download registration\n\nEmail  : ' + email + '\nTime   : ' +
        new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + '\nSource : ' + source
      );
    }

    return jsonOut({ success: true, isNew: !exists });
  } catch (err) {
    return jsonOut({ success: false, error: String(err) });
  }
}

// GET /exec?key=<ADMIN_KEY> — fetch all registrations for admin panel ─────────
function doGet(e) {
  const key = String(e.parameter.key || '');
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

  const today = data.filter(r => r.timestamp.startsWith(todayStr)).length;
  data.reverse(); // newest first

  return jsonOut({ success: true, total: data.length, today: today, data: data });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    'YOUR DIRECT DOWNLOAD LINK:',
    DOWNLOAD_URL,
    '',
    '  SHA-256 Verified | Version 1.0.0 | 78 MB | Windows 10/11 64-bit | MIT Licensed',
    '',
    'SETUP IN 3 STEPS:',
    '  1. Run INTENT-Setup-1.0.0.exe',
    '  2. Get your FREE Gemini API key at https://aistudio.google.com/app/apikey',
    '     (No credit card — 15 req/min free forever)',
    '  3. Press Alt+Space in INTENT, paste your key, and start talking!',
    '',
    'Zero subscriptions. Zero server hops. 100% local-first.',
    '',
    '— Srinivas Reddy | INTENT Developer',
    '  https://devsrinivas69.github.io/INTENT/',
  ].join('\n');
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
