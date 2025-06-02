// Improved click handler with better URL validation
document.addEventListener("click", function (e) {
  const anchor = e.target.closest("a");
  if (!anchor || !anchor.href) return;

  // Check for download attribute or common download patterns
  const isDownload = 
    anchor.hasAttribute("download") ||
    anchor.href.match(/\.(exe|zip|rar|tar|7z|mp4|mkv|avi|mov|wmv|flv|webm|mp3|wav|flac|aac|ogg|pdf|epub|txt|doc|docx|xls|xlsx|ppt|pptx|csv|png|jpg|jpeg|gif|bmp|tiff|psd|svg|ico)(\?|$)/i);
  
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