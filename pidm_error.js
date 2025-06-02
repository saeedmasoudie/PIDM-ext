document.addEventListener('DOMContentLoaded', () => {
  const retryButton = document.getElementById('retryButton');
  const normalDownloadLink = document.getElementById('normalDownload');

  chrome.storage.local.get(['pendingDownloadUrl'], (result) => {
    const downloadUrl = result.pendingDownloadUrl;

    retryButton.addEventListener('click', () => {
      // Check if PIDM is running now
      fetch(`http://127.0.0.1:9999/api/download`)
        .then(response => {
          if (response.ok) {
            // PIDM is running, retry the download
            chrome.runtime.sendMessage({
              action: "retryDownload",
              url: downloadUrl
            });
            window.close();
          } else {
            alert("PIDM is still not running. Please launch the application first.");
          }
        })
        .catch(() => {
          alert("PIDM is still not running. Please launch the application first.");
        });
    });

    normalDownloadLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.downloads.download({
        url: downloadUrl,
        conflictAction: 'uniquify'
      });
      window.close();
    });
  });
});