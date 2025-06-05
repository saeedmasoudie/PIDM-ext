// Enhanced Content Script for Universal Download Detection
(() => {
  // Track clicked elements to prevent duplicate handling
  const handledElements = new WeakSet();

  // Detect all download triggers
  const detectDownloadTriggers = (target) => {
  const href = target.href || target.dataset.href;

  // Skip empty, JS-based, or anchor links
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return null;

  // Only process actual downloadable file types
  const fileRegex = /\.(zip|rar|7z|pdf|mp3|mp4|avi|docx?|xlsx?|exe|apk|iso)(\?|$)/i;
  const looksLikeFile = fileRegex.test(href);

  // <a download>
  if (target.tagName === 'A' && target.hasAttribute('download') && looksLikeFile) return href;

  // Class/id contains "download" + href looks like a file
  const hasDownloadKeyword = /(download|dl|save)(\b|_)/i;
  if ((hasDownloadKeyword.test(target.className || '') || hasDownloadKeyword.test(target.id || '')) && looksLikeFile) {
    return href;
  }

  return null;
};


  // Intercept click events
  const handleClick = (e) => {
    // Check if we already processed this element
    if (handledElements.has(e.target)) return;
    
    // Check all possible click paths (including parent elements)
    let downloadUrl = null;
    for (let el = e.target; el && el !== document; el = el.parentElement) {
      downloadUrl = detectDownloadTriggers(el);
      if (downloadUrl) {
        handledElements.add(el);
        break;
      }
    }

    if (!downloadUrl) return;

    // Special handling for streaming URLs
    if (downloadUrl.includes('m3u8') || downloadUrl.includes('mpd')) {
      chrome.runtime.sendMessage({
        action: 'streamIntercepted',
        url: downloadUrl,
        pageUrl: window.location.href
      });
      e.preventDefault();
      return;
    }

    // Standard download handling
    chrome.runtime.sendMessage({
      action: 'downloadIntercepted',
      url: downloadUrl,
      pageUrl: window.location.href,
      referrer: document.referrer
    }).catch(() => {
      // Fallback to normal download if extension fails
      window.location.href = downloadUrl;
    });

    e.preventDefault();
    e.stopImmediatePropagation();
  };

  // MutationObserver for dynamic content
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          node.querySelectorAll?.('a[download], video, audio, [onclick*="download"], [class*="download"]').forEach((el) => {
            el.addEventListener('click', handleClick, { capture: true });
          });
        }
      });
    });
  });

  // Initial setup
  document.addEventListener('click', handleClick, { capture: true });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['href', 'download', 'onclick', 'class', 'id']
  });

  // Detect iframe downloads
  if (window !== window.top) {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'downloadTriggered') {
        chrome.runtime.sendMessage({
          action: 'iframeDownload',
          url: event.data.url,
          sourceUrl: window.location.href
        });
      }
    });
  }

  // Inject download detection into new windows
  window.addEventListener('beforeunload', () => {
    if (window.opener) {
      window.opener.postMessage({
        type: 'windowDownload',
        url: window.location.href
      }, '*');
    }
  });

  setInterval(() => {
    document.querySelectorAll('a[download], [class*="download"], [onclick*="download"]').forEach(el => {
      if (!handledElements.has(el)) {
        el.addEventListener('click', handleClick, { capture: true });
        handledElements.add(el);
      }
    });
  }, 5000);
  
})();