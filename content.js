// Improved click handler with better URL validation
document.addEventListener("click", function (e) {
  const anchor = e.target.closest("a");
  if (!anchor || !anchor.href) return;

  // Check for download attribute or common download patterns
  const isDownload = 
    anchor.hasAttribute("download") ||
    anchor.href.match(/\.(exe|zip|rar|mp4|mkv|pdf)(\?|$)/i);
  
  if (isDownload) {
    e.preventDefault();
    chrome.runtime.sendMessage({
      action: "downloadIntercepted",
      url: anchor.href
    }).catch(() => {
      // Fallback to normal download if extension fails
      window.location.href = anchor.href;
    });
  }
});