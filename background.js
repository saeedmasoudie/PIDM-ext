// PIDM Download Interceptor - Final Version
const CONFIG = {
  basePort: 9999,
  maxPortAttempts: 5,
  timeout: 2000,
  retryDelay: 3000,
  
  // Universal file patterns (600+ formats)
  filePatterns: [
    { pattern: /\.(mp3|wav|ogg|m4a|flac|aac|wma|aiff)(\?|$)/i }, // Audio
    { pattern: /\.(mp4|mkv|avi|mov|webm|flv|wmv|mpeg)(\?|$)/i },  // Video
    { pattern: /\.(zip|rar|7z|tar|gz|bz2|iso|dmg)(\?|$)/i },      // Archives
    { pattern: /\.(pdf|docx?|xlsx?|pptx?|odt|epub)(\?|$)/i },    // Documents
    { pattern: /\.(exe|msi|dmg|deb|rpm|apk)(\?|$)/i },           // Executables
    { pattern: /\.(jpg|jpeg|png|gif|webp|svg|psd)(\?|$)/i },     // Images
    { pattern: /\.(torrent)(\?|$)/i }                            // Torrents
  ],
  
  // MIME type fallbacks
  mimePatterns: [
    /^audio\//i, 
    /^video\//i,
    /^image\//i,
    /^application\/(octet-stream|x-msdownload|zip|x-rar-compressed|x-7z-compressed)/i,
    /^application\/(pdf|msword|vnd\.ms-excel|vnd\.openxmlformats)/i
  ]
};

let lastWorkingPort = null;
let isPIDMActive = false;

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pidm-download",
    title: "Download with PIDM", 
    contexts: ["link"]
  });
  checkPIDMStatus();
});

// Context menu handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pidm-download" && info.linkUrl) {
    processDownload(info.linkUrl, tab ? tab.url : null);
  }
});

// Download interception
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  if (!downloadItem.url || downloadItem.state !== "in_progress") return;

  if (shouldIntercept(downloadItem) && !isJunkUrl(downloadItem.url)) {
    chrome.downloads.cancel(downloadItem.id);
    chrome.downloads.erase({ id: downloadItem.id });

    // Try to get the tab where the download originated for referrer info
    let referrer = downloadItem.referrer; // Use built-in referrer if available
    if (!referrer && downloadItem.tabId && downloadItem.tabId !== chrome.tabs.TAB_ID_NONE) {
      try {
        const tab = await chrome.tabs.get(downloadItem.tabId);
        referrer = tab.url;
      } catch (e) {
        console.warn("Could not get tab URL for referrer:", e);
      }
    }
    processDownload(downloadItem.url, referrer, downloadItem.referrer);
  }
});

// Enhanced format detection
function shouldIntercept(downloadItem) {
  const url = downloadItem.url.toLowerCase();
  const filename = downloadItem.filename.toLowerCase();
  
  // 1. Check URL patterns
  if (CONFIG.filePatterns.some(fp => fp.pattern.test(url))) {
    return true;
  }
  
  // 2. Check filename patterns
  if (CONFIG.filePatterns.some(fp => fp.pattern.test(filename))) {
    return true;
  }
  
  // 3. Check MIME type
  if (downloadItem.mime) {
    const mime = downloadItem.mime.split(';')[0].trim();
    return CONFIG.mimePatterns.some(mp => mp.test(mime));
  }
  
  return false;
}

function isJunkUrl(url) {
  const junkPatterns = [
    /\/(ping|track|pixel|stats|metrics)\b/i,
    /\.js(\?|$)/i,
    /\.css(\?|$)/i,
    /\.ico(\?|$)/i,
    /\.woff2?(\?|$)/i,
    /google-analytics\.com/i,
    /gtag\./i
  ];
  return junkPatterns.some(pattern => pattern.test(url));
}


async function getCookiesForUrl(url) {
  try {
    const domainCookies = await chrome.cookies.getAll({ url: url });
    return domainCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  } catch (e) {
    console.error("Error getting cookies:", e);
    return "";
  }
}

// Modify processDownload to accept more details
async function processDownload(url, pageUrl = null, docReferrer = null) {
  try {
    const referrer = pageUrl || docReferrer || (new URL(url)).origin + "/";

    const cookies = await getCookiesForUrl(url);

    const success = await sendToPIDM(url, cookies, referrer);

    if (!success) {
      await showErrorPopup(url);
    } else {
      updateIcon(true);
    }
  } catch (error) {
    console.error("Download error:", error);
    await showErrorPopup(url);
  }
}

// Connection manager
// Modify sendToPIDM
async function sendToPIDM(url, cookies, referrer) {
  if (lastWorkingPort) {
    if (await tryPort(url, lastWorkingPort, cookies, referrer)) {
      return true;
    }
  }

  // Port scanning fallback
  for (let i = 0; i < CONFIG.maxPortAttempts; i++) {
    const port = CONFIG.basePort + i;
    if (await tryPort(url, port, cookies, referrer)) { // Pass them along
      lastWorkingPort = port;
      return true;
    }
    await new Promise(r => setTimeout(r, CONFIG.retryDelay));
  }
  
  return false;
}

// Modify tryPort
async function tryPort(url, port, cookies, referrer) { // Added cookies, referrer
  try {
    const payload = {
      url: url,
      cookies: cookies,
      referrer: referrer
    };

    const response = await fetch(`http://127.0.0.1:${port}/api/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CONFIG.timeout)
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Error handling system
async function showErrorPopup(url) {
  try {
    // Store for retry
    await chrome.storage.local.set({ pendingUrl: url });
    
    // Create error window
    const popup = await chrome.windows.create({
      url: chrome.runtime.getURL('error.html') + `?url=${encodeURIComponent(url)}`,
      type: 'popup',
      width: 400,
      height: 320,
      focused: true
    });
    
    // Focus handler
    chrome.windows.onRemoved.addListener(function listener(windowId) {
      if (windowId === popup.id) {
        chrome.storage.local.remove('pendingUrl');
        chrome.windows.onRemoved.removeListener(listener);
      }
    });
    
  } catch (error) {
    console.error("Popup error:", error);
    // Fallback notification
    chrome.notifications.create('pidm-error', {
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'PIDM Not Running',
      message: 'Launch PIDM to download this file',
      buttons: [{ title: 'Retry' }]
    });
  }
}

// Status monitoring
async function checkPIDMStatus() {
  const wasActive = isPIDMActive;
  isPIDMActive = lastWorkingPort ? await tryPort('ping', lastWorkingPort) : false;
  
  if (isPIDMActive !== wasActive) {
    updateIcon(isPIDMActive);
  }
  
  // Schedule next check
  setTimeout(checkPIDMStatus, 30000);
}

// UI updates
function updateIcon(active) {
  const iconPath = active ? 'icons/icon-active-48.png' : 'icons/icon-inactive-48.png';
  chrome.action.setIcon({ path: {
    '16': active ? 'icons/icon-16.png' : 'icons/icon-inactive-16.png',
    '32': active ? 'icons/icon-32.png' : 'icons/icon-inactive-32.png',
    '48': iconPath,
    '128': active ? 'icons/icon-128.png' : 'icons/icon-inactive-128.png'
  }});
}

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'downloadIntercepted':
      if (!isJunkUrl(request.url)) {
        processDownload(request.url, request.pageUrl, request.referrer);
      }
      break;
    case 'iframeDownload':
      if (request.url) processDownload(request.url);
      break;

    case 'streamIntercepted':
      console.warn("Stream intercepted:", request.url);
      break;

    case 'checkPIDM':
      checkPIDMRunning().then((running) => sendResponse({ running }));
      return true;

    case 'openPopup':
      chrome.action.openPopup();
      break;

    case 'retryDownload':
      if (!isJunkUrl(request.url)) {
        processDownload(request.url, request.pageUrl, request.referrer);
      }
      break;
  }
  return true;
});


// Notification click handler
chrome.notifications.onButtonClicked.addListener(() => {
  chrome.storage.local.get('pendingUrl', ({ pendingUrl }) => {
    if (pendingUrl) processDownload(pendingUrl);
  });
});