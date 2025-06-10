// PIDM Download Interceptor

const CONFIG = {
  // Use a high, private port range to avoid conflicts with other apps
  basePort: 49152,
  maxPortAttempts: 10,
  pingTimeout: 300,
  sendTimeout: 5000,
  
  filePatterns: [
    { pattern: /\.(mp3|wav|ogg|m4a|flac|aac|wma|aiff)(\?|$)/i }, // Audio
    { pattern: /\.(mp4|mkv|avi|mov|webm|flv|wmv|mpeg)(\?|$)/i },  // Video
    { pattern: /\.(zip|rar|7z|tar|gz|bz2|iso|dmg)(\?|$)/i },      // Archives
    { pattern: /\.(pdf|docx?|xlsx?|pptx?|odt|epub)(\?|$)/i },    // Documents
    { pattern: /\.(exe|msi|dmg|deb|rpm|apk)(\?|$)/i },           // Executables
    { pattern: /\.(jpg|jpeg|png|gif|webp|svg|psd)(\?|$)/i },     // Images
    { pattern: /\.(torrent)(\?|$)/i }                            // Torrents
  ],
  mimePatterns: [
    /^audio\//i, 
    /^video\//i,
    /^image\//i,
    /^application\/(octet-stream|x-msdownload|zip|x-rar-compressed|x-7z-compressed)/i,
    /^application\/(pdf|msword|vnd\.ms-excel|vnd\.openxmlformats)/i
  ]
};

// --- State Variables ---
let lastWorkingPort = null;
let isFindingPort = false; // A lock to prevent multiple concurrent scans

// --- Core Connection Logic (NEW & IMPROVED) ---

/**
 * Pings a specific port to see if the PIDM listener is active there.
 * @param {number} port The port to ping.
 * @returns {Promise<boolean>} True if the port responds correctly, false otherwise.
 */
async function pingPort(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ping`, {
      method: 'GET',
      signal: AbortSignal.timeout(CONFIG.pingTimeout)
    });
    if (response.ok) {
      const data = await response.json();
      return data.status === 'pidm_active';
    }
  } catch (e) {
    // This is expected if the port is not open or doesn't respond in time.
  }
  return false;
}

/**
 * Finds the active PIDM port. It first checks the last known good port,
 * then scans the defined range. Caches the result for future use.
 * @returns {Promise<number|null>} The active port number, or null if not found.
 */
async function findActivePort() {
  if (isFindingPort) return lastWorkingPort;
  isFindingPort = true;

  // 1. Check if the last known port is still working (fast path).
  if (lastWorkingPort) {
    if (await pingPort(lastWorkingPort)) {
      isFindingPort = false;
      return lastWorkingPort;
    }
    lastWorkingPort = null; // It's gone, so clear the cache.
    updateIcon(false);
  }

  // 2. If not, scan the full range to find a new active port.
  for (let i = 0; i < CONFIG.maxPortAttempts; i++) {
    const port = CONFIG.basePort + i;
    if (await pingPort(port)) {
      lastWorkingPort = port; // Cache the new working port.
      updateIcon(true);
      isFindingPort = false;
      return port;
    }
  }

  // 3. If no port was found after scanning.
  updateIcon(false);
  isFindingPort = false;
  return null;
}

/**
 * Sends the final download payload to the active PIDM port.
 * @param {object} payload The download data (url, cookies, etc.).
 * @returns {Promise<boolean>} True on success, false on failure.
 */
async function sendToPIDM(payload) {
  const activePort = await findActivePort();

  if (!activePort) {
    console.error("Could not find active PIDM listener.");
    await showErrorPopup(payload.url);
    return false;
  }

  try {
    const response = await fetch(`http://127.0.0.1:${activePort}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CONFIG.sendTimeout)
    });

    if (response.ok) {
      console.log("Successfully sent download to PIDM.");
      return true;
    } else {
      console.error("PIDM listener returned an error:", response.status);
      await showErrorPopup(payload.url);
    }
  } catch (e) {
    console.error("Failed to send download data to PIDM:", e);
    // The port probably died, so clear the cache and show the error.
    lastWorkingPort = null;
    updateIcon(false);
    await showErrorPopup(payload.url);
  }
  return false;
}


// --- Main Download Processing & Event Listeners ---

/**
 * Prepares the complete payload and initiates the transfer to PIDM.
 * @param {string} url The download URL.
 * @param {string|null} pageUrl The URL of the page where the download was initiated.
 * @param {string|null} docReferrer The built-in referrer from the download item.
 */
async function processDownload(url, pageUrl = null, docReferrer = null) {
  try {
    // It correctly prioritizes the page URL where the download was clicked.
    const referrer = pageUrl || docReferrer || "";
    const cookies = await getCookiesForUrl(url);
    
    const payload = {
        url: url,
        cookies: cookies,
        referrer: referrer,
        userAgent: navigator.userAgent
    };

    await sendToPIDM(payload);

  } catch (error) {
    console.error("Error preparing download:", error);
    await showErrorPopup(url);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pidm-download",
    title: "Download with PIDM", 
    contexts: ["link", "video", "audio", "image", "page"]
  });
  findActivePort(); // Check for PIDM status on startup/install
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pidm-download") {
    // The link URL or media source URL is the primary target
    const url = info.linkUrl || info.srcUrl || info.pageUrl;
    if (url) {
      // The referrer is the URL of the tab where the click happened
      processDownload(url, tab ? tab.url : null);
    }
  }
});

chrome.downloads.onCreated.addListener(async (downloadItem) => {
  if (!downloadItem.url || downloadItem.state !== "in_progress" || isJunkUrl(downloadItem.url)) {
      return;
  }

  if (shouldIntercept(downloadItem)) {
    chrome.downloads.cancel(downloadItem.id);
    chrome.downloads.erase({ id: downloadItem.id });

    let pageUrl = null;
    if (downloadItem.tabId && downloadItem.tabId !== chrome.tabs.TAB_ID_NONE) {
      try {
        const tab = await chrome.tabs.get(downloadItem.tabId);
        pageUrl = tab.url;
      } catch (e) { console.warn("Could not get tab URL for referrer:", e); }
    }
    processDownload(downloadItem.url, pageUrl, downloadItem.referrer);
  }
});


// --- Helper Functions ---

function shouldIntercept(downloadItem) {
  const url = downloadItem.url.toLowerCase();
  const filename = downloadItem.filename.toLowerCase();
  if (CONFIG.filePatterns.some(fp => fp.pattern.test(url) || fp.pattern.test(filename))) {
    return true;
  }
  if (downloadItem.mime) {
    const mime = downloadItem.mime.split(';')[0].trim();
    return CONFIG.mimePatterns.some(mp => mp.test(mime));
  }
  return false;
}

function isJunkUrl(url) {
  const junkPatterns = [
    /\/(ping|track|pixel|stats|metrics)\b/i,
    /\.js(\?|$)/i, /\.css(\?|$)/i, /\.ico(\?|$)/i, /\.woff2?(\?|$)/i,
    /google-analytics\.com/i, /gtag\./i
  ];
  return junkPatterns.some(pattern => pattern.test(url));
}

async function getCookiesForUrl(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url: url });
    return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  } catch (e) { console.error("Error getting cookies:", e); return ""; }
}

async function showErrorPopup(url) {
  try {
    await chrome.storage.local.set({ pendingUrl: url });
    await chrome.windows.create({
      url: chrome.runtime.getURL('error.html') + `?url=${encodeURIComponent(url)}`,
      type: 'popup', width: 400, height: 320, focused: true
    });
  } catch (error) { console.error("Popup error:", error); }
}

function updateIcon(active) {
  const iconSet = {
    '16': `icons/icon-${active ? 'active' : 'inactive'}-16.png`,
    '48': `icons/icon-${active ? 'active' : 'inactive'}-48.png`,
    '128': `icons/icon-${active ? 'active' : 'inactive'}-128.png`
  };
  chrome.action.setIcon({ path: iconSet });
}

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
      console.warn("Stream intercepted (feature not implemented):", request.url);
      break;
    case 'checkPIDM':
      findActivePort().then((port) => sendResponse({ running: !!port }));
      return true;
    case 'retryDownload':
      if (!isJunkUrl(request.url)) {
        processDownload(request.url, request.pageUrl, request.referrer);
      }
      break;
  }
});

chrome.notifications.onButtonClicked.addListener(() => {
  chrome.storage.local.get('pendingUrl', ({ pendingUrl }) => {
    if (pendingUrl) processDownload(pendingUrl);
  });
});