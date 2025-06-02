document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const downloadUrl = params.get('url');

  document.getElementById('launchBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: "launchPIDM"
    });
  });

  document.getElementById('retryBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: "retryDownload",
      url: downloadUrl
    });
    window.close();
  });

  document.getElementById('normalBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: "normalDownload",
      url: downloadUrl
    });
    window.close();
  });
});