// Universal Download Interceptor for PIDM
const CONFIG = {
  basePort: 9999,
  maxPortAttempts: 5,
  timeout: 2000,
  
  // Supported formats (600+ extensions)
  filePatterns: [
    // Audio
    { pattern: /\.(mp3|wav|ogg|m4a|flac|aac|wma|aiff|ape|alac|opus)(\?|$)/i },
    // Video 
    { pattern: /\.(mp4|mkv|avi|mov|webm|flv|wmv|mpeg|mpg|m4v|3gp|vob|m2ts)(\?|$)/i },
    // Archives
    { pattern: /\.(zip|rar|7z|tar|gz|bz2|xz|z|iso|dmg|pkg|deb|rpm|msi)(\?|$)/i },
    // Documents
    { pattern: /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|odt|ods|odp|md|epub)(\?|$)/i },
    // Images
    { pattern: /\.(jpg|jpeg|png|gif|bmp|tiff|webp|svg|psd|raw|cr2|nef|ai)(\?|$)/i },
    // Executables
    { pattern: /\.(exe|msi|dmg|pkg|deb|rpm|appimage|bat|cmd|sh|apk|ipa)(\?|$)/i },
    // Torrents
    { pattern: /\.(torrent)(\?|$)/i },
    // Developer files
    { pattern: /\.(dll|so|lib|a|jar|war|py|js|json|xml|yml|sql|db|sqlite)(\?|$)/i }
  ],
  
  // MIME type fallbacks
  mimePatterns: [
    /^audio\//i,
    /^video\//i,
    /^image\//i,
    /^application\/(x-msdownload|octet-stream|zip|x-rar-compressed|x-7z-compressed|x-tar|x-gzip)/i,
    /^application\/(pdf|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats)/i,
    /^application\/(x-shockwave-flash|x-font-ttf|x-java-archive)/i
  ]
};

let lastWorkingPort = null;

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  // Create right-click context menu
  chrome.contextMenus.create({
    id: "pidm-download-link",
    title: "Download with PIDM",
    contexts: ["link"]
  });
  
  // Set initial icon state
  updateIcon(false);
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "pidm-download-link" && info.linkUrl) {
    interceptDownload(info.linkUrl);
  }
});

// Download interception
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  if (!downloadItem.url || downloadItem.state !== "in_progress") return;
  
  if (shouldIntercept(downloadItem)) {
    chrome.downloads.cancel(downloadItem.id);
    chrome.downloads.erase({ id: downloadItem.id });
    interceptDownload(downloadItem.url);
  }
});

// Universal format detection
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

// Main download processing
async function interceptDownload(url) {
  try {
    const success = await sendToPIDM(url);
    
    if (!success) {
      await showErrorPopup(url);
    } else {
      updateIcon(true);
    }
  } catch (error) {
    console.error("Download failed:", error);
    await showErrorPopup(url);
    updateIcon(false);
  }
}

// Send to PIDM with port scanning
async function sendToPIDM(url) {
  // Try last working port first
  if (lastWorkingPort) {
    if (await tryPort(url, lastWorkingPort)) {
      return true;
    }
  }

  // Scan ports sequentially
  for (let i = 0; i < CONFIG.maxPortAttempts; i++) {
    const port = CONFIG.basePort + i;
    if (await tryPort(url, port)) {
      lastWorkingPort = port;
      return true;
    }
  }
  
  return false;
}

// Try sending to specific port
async function tryPort(url, port) {
  try {
    const response = await fetchWithTimeout(
      `http://127.0.0.1:${port}/api/download`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        timeout: CONFIG.timeout
      }
    );
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Fetch with timeout
function fetchWithTimeout(url, options = {}) {
  const { timeout = 2000, ...fetchOptions } = options;
  
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('Timeout'));
    }, timeout);

    fetch(url, { ...fetchOptions, signal: controller.signal })
      .then(response => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// Show error popup with options
async function showErrorPopup(url) {
  // Store URL for retry
  await chrome.storage.local.set({ pendingDownloadUrl: url });

  // Create popup window
  await chrome.windows.create({
    url: chrome.runtime.getURL('error.html') + `?url=${encodeURIComponent(url)}`,
    type: 'popup',
    width: 420,
    height: 320,
    focused: true
  });
}

// Update browser action icon
function updateIcon(isActive) {
  const iconPath = isActive 
    ? "icons/icon-active-48.png" 
    : "icons/icon-inactive-48.png";
  chrome.action.setIcon({ path: iconPath });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "retryDownload":
      interceptDownload(request.url);
      break;
      
    case "normalDownload":
      chrome.downloads.download({
        url: request.url,
        conflictAction: 'uniquify'
      });
      break;
      
    case "launchPIDM":
      window.open('pidm://launch', '_blank');
      break;
      
    case "checkStatus":
      sendResponse({ isActive: lastWorkingPort !== null });
      break;
  }
});

// Periodic status check
setInterval(async () => {
  if (lastWorkingPort) {
    const isAlive = await tryPort('ping', lastWorkingPort);
    if (!isAlive) {
      lastWorkingPort = null;
      updateIcon(false);
    }
  }
}, 30000); // Check every 30 seconds