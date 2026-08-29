let nativePort = null;

function connectNativeHost() {
  try {
    nativePort = chrome.runtime.connectNative('com.intent.native_host');
    
    nativePort.onMessage.addListener((msg) => {
      // Forward commands from INTENT to the active Canva tab
      chrome.tabs.query({ url: ['*://www.canva.com/*', '*://canva.com/*'] }, 
        (tabs) => {
          tabs.forEach(tab => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
            }
          });
        }
      );
    });

    nativePort.onDisconnect.addListener(() => {
      console.log('[INTENT] Native host disconnected, retrying in 3s...');
      nativePort = null;
      setTimeout(connectNativeHost, 3000);
    });

    console.log('[INTENT] Native host connected.');
  } catch (e) {
    console.warn('[INTENT] Native host connection failed:', e);
    setTimeout(connectNativeHost, 5000);
  }
}

// Listen for DOM snapshots from content script and forward to native host
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'DOM_SNAPSHOT' && nativePort) {
    try {
      nativePort.postMessage(msg);
    } catch (e) {
      console.warn('[INTENT] Failed to post snapshot to native host:', e);
    }
  }
});

// Auto-connect on startup
connectNativeHost();

// Re-connect when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  connectNativeHost();
});
