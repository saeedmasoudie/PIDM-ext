/**
 * copyright - https://github.com/saeedmasoudie/PIDM-ext
 * This script runs on every page and is responsible for two main tasks:
 * 1. Intercepting standard download links and sending them to the background script.
 * 2. Finding video/stream elements on the page and injecting a custom "Download with PIDM" button.
 */
(() => {
    // --- Stream Detection and UI Injection ---
    const processedVideos = new WeakSet();

    function createUiContainer(videoElement) {
        const container = document.createElement('div');
        container.className = 'pidm-button-container';

        // --- Download Button ---
        const downloadButton = document.createElement('button');
        downloadButton.className = 'pidm-download-button';
        downloadButton.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download</span>
        `;
        downloadButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            let streamUrl = videoElement.src;
            if (!streamUrl) {
                const sourceElement = videoElement.querySelector('source[src]');
                if (sourceElement) streamUrl = sourceElement.src;
            }

            if (streamUrl) {
                chrome.runtime.sendMessage({
                    action: 'sendToPidm',
                    url: streamUrl,
                    isStream: true,
                    pageUrl: window.location.href,
                    referrer: document.referrer
                });
                container.innerHTML = '<div style="padding: 20px; text-align: center; font-size: 14px; color: white;">Sent!</div>';
                setTimeout(() => { container.style.display = 'none'; }, 2000);
            } else {
                container.innerHTML = '<div style="padding: 20px; text-align: center; font-size: 14px; color: #ff8a80;">Error</div>';
            }
        });

        // --- Ignore Button ---
        const ignoreButton = document.createElement('button');
        ignoreButton.className = 'pidm-ignore-button';
        ignoreButton.textContent = 'Ignore';
        ignoreButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const videoSrc = videoElement.src || videoElement.querySelector('source[src]')?.src;
            if (videoSrc) {
                sessionStorage.setItem(`pidm-ignored-${videoSrc}`, 'true');
            }
            container.remove();
        });

        container.appendChild(downloadButton);
        container.appendChild(ignoreButton);
        return container;
    }

    function injectVideoButtons() {
        document.querySelectorAll('video, iframe').forEach(element => {
            if (processedVideos.has(element)) return;

            const videoSrc = element.src || element.querySelector('source[src]')?.src;
            if (videoSrc && sessionStorage.getItem(`pidm-ignored-${videoSrc}`)) {
                return;
            }

            const isStream = (videoSrc && (videoSrc.includes('blob:') || videoSrc.includes('.m3u8') || videoSrc.includes('.mpd'))) || element.tagName === 'VIDEO';

            if (isStream) {
                processedVideos.add(element);

                const wrapper = document.createElement('div');
                wrapper.className = 'pidm-video-wrapper';
                element.parentNode.insertBefore(wrapper, element);
                wrapper.appendChild(element);

                const uiContainer = createUiContainer(element);
                wrapper.appendChild(uiContainer);
            }
        });
    }

    // --- Standard Download Link Interception ---
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a');
        if (!link || !link.href) return;

        const url = link.href;
        const fileExtensionRegex = /\.(zip|rar|7z|exe|msi|iso|mp4|mkv|pdf|mp3)(\?|$)/i;

        if (fileExtensionRegex.test(url) && !url.includes('.m3u8') && !url.includes('.mpd')) {
            event.preventDefault();
            event.stopPropagation();
            chrome.runtime.sendMessage({
                action: 'sendToPidm',
                url: url,
                isStream: false,
                pageUrl: window.location.href,
                referrer: document.referrer
            });
        }
    }, true);

    // --- Initialization ---
    setInterval(injectVideoButtons, 2000);
    window.addEventListener('load', injectVideoButtons);
})();
