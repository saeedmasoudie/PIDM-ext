/**
 * copyright - https://github.com/saeedmasoudie/PIDM-ext
 * This service worker handles all communication with the native PIDM application.
 * It listens for messages from the content script and forwards the download
 * information to the correct port where PIDM is listening.
 */

const CONFIG = {
    basePort: 49152,
    maxPortAttempts: 10,
    pingTimeout: 300,
    sendTimeout: 5000,
};

// --- State Management ---
let lastWorkingPort = null;
let isFindingPort = false;

// --- Core Connection Logic ---
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
        // Errors are expected if the port isn't open
    }
    return false;
}

async function findActivePort() {
    if (isFindingPort) return lastWorkingPort;
    isFindingPort = true;

    if (lastWorkingPort && await pingPort(lastWorkingPort)) {
        isFindingPort = false;
        return lastWorkingPort;
    }

    lastWorkingPort = null;
    updateIcon(false);

    for (let i = 0; i < CONFIG.maxPortAttempts; i++) {
        const port = CONFIG.basePort + i;
        if (await pingPort(port)) {
            lastWorkingPort = port;
            updateIcon(true);
            isFindingPort = false;
            return port;
        }
    }

    isFindingPort = false;
    return null;
}

async function sendToPIDM(payload) {
    const activePort = await findActivePort();

    if (!activePort) {
        console.error("PIDM listener not found.");
        showErrorPopup(payload.url);
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
            console.log("Successfully sent download to PIDM:", payload.url);
            return true;
        } else {
            console.error("PIDM listener returned an error:", response.status);
            showErrorPopup(payload.url);
        }
    } catch (e) {
        console.error("Failed to send data to PIDM:", e);
        lastWorkingPort = null;
        updateIcon(false);
        showErrorPopup(payload.url);
    }
    return false;
}

// --- Main Event Handler ---

async function processDownloadRequest(request) {
    try {
        const { url, isStream, pageUrl, referrer } = request;
        const cookies = await getCookiesForUrl(url);

        const payload = {
            url: url,
            is_stream: isStream,
            cookies: cookies,
            referrer: pageUrl || referrer || "",
            user_agent: navigator.userAgent
        };

        await sendToPIDM(payload);
    } catch (error) {
        console.error("Error processing download request:", error);
        showErrorPopup(request.url);
    }
}

// --- Listeners ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sendToPidm') {
        processDownloadRequest(request);
        sendResponse({ status: "received" });
    }
    return true;
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "pidm-download",
        title: "Download with PIDM",
        contexts: ["link", "video", "audio", "image"]
    });
    findActivePort();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pidm-download") {
        const url = info.linkUrl || info.srcUrl;
        if (url) {
            const isStream = info.mediaType === 'video' || info.mediaType === 'audio' || url.includes('.m3u8') || url.includes('.mpd');
            processDownloadRequest({
                url: url,
                isStream: isStream,
                pageUrl: tab.url,
                referrer: info.frameUrl || tab.url
            });
        }
    }
});

// --- Helper Functions ---
async function getCookiesForUrl(url) {
    try {
        const cookies = await chrome.cookies.getAll({ url });
        return cookies.map(c => `${c.name}=${c.value}`).join('; ');
    } catch (e) {
        console.error("Error getting cookies:", e);
        return "";
    }
}

function updateIcon(isActive) {
    const status = isActive ? 'active' : 'inactive';
    chrome.action.setIcon({
        path: {
            "16": `icons/icon-${status}-16.png`,
            "48": `icons/icon-${status}-48.png`,
            "128": `icons/icon-${status}-128.png`
        }
    });
}

async function showErrorPopup(url) {
    try {
        await chrome.windows.create({
            url: `error.html?url=${encodeURIComponent(url)}`,
            type: 'popup',
            width: 400,
            height: 320,
        });
    } catch (e) {
        console.error("Failed to create error popup:", e);
    }
}

setInterval(findActivePort, 15000);
