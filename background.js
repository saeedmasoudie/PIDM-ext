chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "downloadWithPIDM",
    title: "Download with PIDM",
    contexts: ["link", "image"]
  });

  chrome.contextMenus.create({
    id: "downloadAllWithPIDM",
    title: "Download all links with PIDM",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "downloadWithPIDM") {
    sendToPIDM({ url: info.linkUrl || info.srcUrl });
  }

  if (info.menuItemId === "downloadAllWithPIDM") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon-128.png",
      title: "Download All (Coming Soon)",
      message: "Download All with PIDM is still under development. Only first few links may be processed."
    });

    if (info.selectionText) {
      const urls = [...info.selectionText.matchAll(/https?:\/\/\S+/g)].map(m => m[0]);
      if (urls.length > 0) sendToPIDM({ urls });
    }
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "download_with_pidm") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, { action: "getDownloadTarget" });
    });
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action && (msg.action === "downloadWithPIDMFromContent" || msg.action === "downloadFromContext")) {
    sendToPIDM({ url: msg.url });
  }
  if (msg.action === "downloadAllWithPIDMFromContent" && Array.isArray(msg.urls)) {
    sendToPIDM({ urls: msg.urls });
  }
});

function sendToPIDM(payload) {
  chrome.runtime.sendNativeMessage("com.pidm.native", payload, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[PIDM Extension] Native messaging error:", chrome.runtime.lastError.message);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon-128.png",
        title: "PIDM Error",
        message: "Could not communicate with PIDM. Is it running?"
      });
    } else {
      console.log("[PIDM Extension] Response from PIDM:", response);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon-128.png",
        title: "PIDM",
        message: "Download sent to PIDM!"
      });
    }
  });
}
