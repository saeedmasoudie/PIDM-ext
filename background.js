// Configuration
const CONFIG = {
  basePort: 9999,
  maxPortAttempts: 5,
  timeout: 2000,
  allowedFileExtensions: [
    '.exe', '.zip', '.rar', '.7z', '.tar', '.gz',
    '.mp4', '.mkv', '.avi', '.mov', '.webm',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.deb', '.rpm', '.dmg', '.iso', '.msi'
  ]
};

let lastWorkingPort = null;

// Initialize context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pidm-download-link",
    title: "Download with PIDM",
    contexts: ["link"]
  });
});

// Context menu handler
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "pidm-download-link" && info.linkUrl) {
    handleDownload(info.linkUrl);
  }
});

// Download interception
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  if (!downloadItem.url || downloadItem.state !== "in_progress") return;
  
  if (await shouldInterceptDownload(downloadItem)) {
    chrome.downloads.cancel(downloadItem.id);
    chrome.downloads.erase({ id: downloadItem.id });
    handleDownload(downloadItem.url);
  }
});

// Check if we should intercept download
function shouldInterceptDownload(downloadItem) {
  // Check by file extension
  const fileExtension = '.' + downloadItem.filename.split('.').pop().toLowerCase();
  if (CONFIG.allowedFileExtensions.includes(fileExtension)) {
    return true;
  }
  
  // Fallback to MIME type
  if (downloadItem.mime) {
    const mimeParts = downloadItem.mime.split(';')[0].trim();
    const commonMimes = [
      'application/octet-stream',
      'application/x-msdownload',
      'application/zip',
      'application/x-rar-compressed'
    ];
    return commonMimes.includes(mimeParts);
  }
  
  return false;
}

// Main download handler
async function handleDownload(url) {
  try {
    const success = await sendToPIDM(url);
    if (!success) {
      showPIDMNotRunningNotification(url);
    }
  } catch (error) {
    showPIDMNotRunningNotification(url);
  }
}

// Send to PIDM (simplified version)
async function sendToPIDM(url) {
  // Try last working port first
  if (lastWorkingPort) {
    if (await tryPort(url, lastWorkingPort)) {
      return true;
    }
  }

  // Try sequential ports
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

// Fetch with timeout helper
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

// Show notification when PIDM isn't running
function showPIDMNotRunningNotification(url) {
  // Store URL for retry
  chrome.storage.local.set({ pendingDownloadUrl: url });

  chrome.notifications.create('pidm-not-running', {
    type: 'basic',
    iconUrl: 'icons/icon-48.png',
    title: 'PIDM Not Running',
    message: 'Please launch PIDM Download Manager first',
    buttons: [
      { title: 'Try Again' },
      { title: 'Download Normally' }
    ]
  });
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId === 'pidm-not-running') {
    const { pendingDownloadUrl } = await chrome.storage.local.get('pendingDownloadUrl');
    
    if (buttonIndex === 0) { // Try Again
      handleDownload(pendingDownloadUrl);
    } 
    else if (buttonIndex === 1) { // Download Normally
      chrome.downloads.download({
        url: pendingDownloadUrl,
        conflictAction: 'uniquify'
      });
    }
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkConnection") {
    // We can't actually check without /api/status, so we'll assume
    // PIDM is running if we have a last working port
    sendResponse({ 
      connected: lastWorkingPort !== null,
      port: lastWorkingPort 
    });
  }
});