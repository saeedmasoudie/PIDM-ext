const downloadExtensions = /\.(zip|exe|mp4|avi|mkv|webm|pdf|rar|7z|msi|dmg|mov|jpg|png|svg|docx?|xlsx?|pptx?|flac|mp3|wav|epub|apk)$/i;

document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a || !a.href) return;
  const isDownload = a.hasAttribute("download") || downloadExtensions.test(a.href);
  if (isDownload) {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: "downloadFromContext", url: a.href });
  }
}, true);

// For keyboard shortcut fallback
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "getDownloadTarget") {
    const el = document.querySelector("video[src]") || document.querySelector("a[href]");
    const url = el?.src || el?.href;
    if (url) chrome.runtime.sendMessage({ action: "downloadWithPIDMFromContent", url });
  }
});

// FLOATING VIDEO BUTTONS (disable video overlay)

/*
let floatingBtn = null;

function createFloatingBtn(videoUrl) {
  if (floatingBtn) floatingBtn.remove();

  floatingBtn = document.createElement("div");
  floatingBtn.innerHTML = `<button id="pidm-dl-btn">Download with PIDM</button><button id="pidm-close-btn">✕</button>`;
  Object.assign(floatingBtn.style, {
    position: "absolute",
    zIndex: 9999,
    display: "flex",
    gap: "5px"
  });

  const pidmBtn = floatingBtn.querySelector("#pidm-dl-btn");
  const closeBtn = floatingBtn.querySelector("#pidm-close-btn");

  Object.assign(pidmBtn.style, {
    background: "#1976d2",
    color: "white",
    border: "none",
    borderRadius: "4px",
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: "12px"
  });

  Object.assign(closeBtn.style, {
    background: "transparent",
    border: "none",
    fontSize: "14px",
    cursor: "pointer",
    color: "#aaa"
  });

  pidmBtn.onclick = () => {
    chrome.runtime.sendMessage({ action: "downloadWithPIDMFromContent", url: videoUrl });
    floatingBtn.remove();
    floatingBtn = null;
  };

  closeBtn.onclick = () => {
    floatingBtn.remove();
    floatingBtn = null;
  };

  document.body.appendChild(floatingBtn);
}

function tryAttachToVideos() {
  document.querySelectorAll("video").forEach(video => {
    if (!video.src) {
      const source = video.querySelector("source");
      if (source) video.src = source.src;
    }

    video.addEventListener("mouseenter", () => {
      const rect = video.getBoundingClientRect();
      if (video.src) {
        createFloatingBtn(video.src);
        floatingBtn.style.top = `${window.scrollY + rect.top + 10}px`;
        floatingBtn.style.left = `${window.scrollX + rect.left + 10}px`;
      }
    });

    video.addEventListener("mouseleave", () => {
      if (floatingBtn) {
        floatingBtn.remove();
        floatingBtn = null;
      }
    });
  });
}

const observer = new MutationObserver(tryAttachToVideos);
observer.observe(document.body, { childList: true, subtree: true });
tryAttachToVideos();
*/
