// Enhanced Content Script for Universal Download Detection
(() => {
  // Track clicked elements to prevent duplicate handling
  const handledElements = new WeakSet();

  // Detect all download triggers
  const detectDownloadTriggers = (target) => {
    // Standard <a download> elements
    if (target.tagName === 'A' && target.hasAttribute('download')) {
      return target.href;
    }

    // Video/audio source elements
    if (['VIDEO', 'AUDIO'].includes(target.tagName)) {
      const src = target.src || target.currentSrc;
      if (src) return src;
    }

    // JavaScript download triggers
    if (target.getAttribute?.('onclick')?.includes('download') ||
        target.getAttribute?.('onmousedown')?.includes('download')) {
      return target.href || target.dataset.href;
    }

    // Common download button patterns
    if (target.classList?.toString().includes('download') ||
        target.id?.includes('download')) {
      return target.href || target.dataset.href;
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
})();