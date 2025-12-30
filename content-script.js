// YouTube Study Mode - Content Script (Complete Rewrite)
(function() {
  'use strict';

  const DEBUG = true;
  const log = (...args) => DEBUG && console.log('%c[YT-Study]', 'color: #00d4ff; font-weight: bold', ...args);

  let settings = {
    enabled: false,
    filterMode: 'blur',
    keywords: ['tutorial', 'lecture', 'course', 'learn', 'study', 'education', 'explained', 'how to', 'guide', 'lesson'],
    channels: [],
    allowedVideos: [],
    blockAreas: {
      home: true,
      search: true,
      sidebar: true,
      shorts: true,
      trending: true,
      endscreen: true
    }
  };

  let stats = { filtered: 0, allowed: 0, total: 0 };
  let observer = null;
  let processedElements = new WeakSet();

  const VIDEO_SELECTORS = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-playlist-panel-video-renderer'
  ].join(', ');

  function getCurrentPage() {
    const path = window.location.pathname;
    if (path === '/' || path === '') return 'home';
    if (path.startsWith('/results')) return 'search';
    if (path.startsWith('/watch')) return 'watch';
    if (path.startsWith('/shorts')) return 'shorts';
    if (path.startsWith('/feed/trending') || path.startsWith('/feed/explore')) return 'trending';
    if (path.startsWith('/feed/subscriptions')) return 'home';
    return 'other';
  }

  function shouldFilterOnPage() {
    const page = getCurrentPage();
    const areas = settings.blockAreas || {};
    
    switch(page) {
      case 'home': return areas.home !== false;
      case 'search': return areas.search !== false;
      case 'watch': return areas.sidebar !== false;
      case 'shorts': return areas.shorts !== false;
      case 'trending': return areas.trending !== false;
      default: return true;
    }
  }

  function getVideoInfo(element) {
    const info = { id: null, title: '', channel: '', isShort: false };

    const links = element.querySelectorAll('a[href*="watch?v="], a[href*="/shorts/"]');
    for (const link of links) {
      let match = link.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (match) { info.id = match[1]; break; }
      match = link.href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (match) { info.id = match[1]; info.isShort = true; break; }
    }

    if (element.tagName?.toLowerCase().includes('reel')) {
      info.isShort = true;
    }

    const titleSelectors = ['#video-title', 'yt-formatted-string#video-title', '#title', '.title', 'h3 a', 'span#video-title'];
    for (const sel of titleSelectors) {
      const el = element.querySelector(sel);
      const text = el?.textContent?.trim() || el?.getAttribute('title') || el?.getAttribute('aria-label');
      if (text && text.length > 2) { info.title = text.toLowerCase(); break; }
    }

    const channelSelectors = ['#channel-name a', '#channel-name yt-formatted-string', 'ytd-channel-name a', '#byline a', '.ytd-channel-name a'];
    for (const sel of channelSelectors) {
      const el = element.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text && text.length > 1) { info.channel = text.toLowerCase(); break; }
    }

    return info;
  }

  function isEducational(info) {
    const { title, channel, isShort } = info;
    
    if (isShort && settings.blockAreas?.shorts !== false) return false;

    const keywords = (settings.keywords || []).map(k => k.toLowerCase().trim()).filter(Boolean);
    const channels = (settings.channels || []).map(c => c.toLowerCase().trim()).filter(Boolean);

    if (keywords.length === 0 && channels.length === 0) return true;

    if (channels.length > 0 && channel) {
      for (const c of channels) {
        if (channel.includes(c) || c.includes(channel)) return true;
      }
    }

    if (keywords.length > 0 && title) {
      for (const keyword of keywords) {
        if (title.includes(keyword)) return true;
      }
    }

    return false;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function applyFilter(element, info) {
    if (!element || !element.isConnected) return;
    
    const mode = settings.filterMode || 'blur';
    
    element.classList.remove('yt-study-blur', 'yt-study-hide', 'yt-study-allowed');
    element.querySelector('.yt-study-overlay')?.remove();

    element.classList.add(`yt-study-${mode}`);
    element.setAttribute('data-yt-study-filtered', 'true');
    
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.position === 'static') {
      element.style.position = 'relative';
    }

    const overlay = document.createElement('div');
    overlay.className = 'yt-study-overlay';
    
    const titlePreview = info.title ? 
      (info.title.length > 25 ? info.title.substring(0, 25) + '...' : info.title) : 'Video';

    overlay.innerHTML = `
      <div class="yt-study-overlay-content">
        <div class="yt-study-overlay-icon">${info.isShort ? '🎬' : '🚫'}</div>
        <div class="yt-study-overlay-title">Blocked</div>
        <div class="yt-study-overlay-subtitle">${escapeHtml(titlePreview)}</div>
        <div class="yt-study-overlay-actions">
          <button class="yt-study-btn yt-study-allow" data-action="allow">✓ Allow</button>
          <button class="yt-study-btn yt-study-peek" data-action="peek">👁 Peek</button>
        </div>
      </div>
    `;

    const allowBtn = overlay.querySelector('[data-action="allow"]');
    const peekBtn = overlay.querySelector('[data-action="peek"]');

    if (allowBtn) {
      allowBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        allowVideo(info.id, element);
      });
    }

    if (peekBtn) {
      peekBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        peekVideo(element);
      });
    }

    overlay.addEventListener('click', (e) => e.stopPropagation());
    element.appendChild(overlay);
    stats.filtered++;
  }

  function removeFilter(element) {
    if (!element) return;
    element.classList.remove('yt-study-blur', 'yt-study-hide', 'yt-study-allowed');
    element.removeAttribute('data-yt-study-filtered');
    element.querySelector('.yt-study-overlay')?.remove();
  }

  function markAllowed(element) {
    removeFilter(element);
    element.classList.add('yt-study-allowed');
    stats.allowed++;
  }

  function allowVideo(videoId, element) {
    if (videoId) {
      if (!settings.allowedVideos) settings.allowedVideos = [];
      if (!settings.allowedVideos.includes(videoId)) {
        settings.allowedVideos.push(videoId);
        chrome.storage.sync.set({ allowedVideos: settings.allowedVideos });
      }
    }
    markAllowed(element);
    stats.filtered = Math.max(0, stats.filtered - 1);
    sendStats();
  }

  function peekVideo(element) {
    const mode = settings.filterMode || 'blur';
    element.classList.remove('yt-study-blur', 'yt-study-hide');
    const overlay = element.querySelector('.yt-study-overlay');
    if (overlay) overlay.style.opacity = '0';

    setTimeout(() => {
      if (element.getAttribute('data-yt-study-filtered') === 'true') {
        element.classList.add(`yt-study-${mode}`);
        if (overlay) overlay.style.opacity = '';
      }
    }, 3000);
  }

  function processElement(element) {
    if (!element || !element.isConnected) return;
    if (processedElements.has(element)) return;
    
    processedElements.add(element);
    
    const info = getVideoInfo(element);
    if (!info.title && !info.channel && !info.id) {
      processedElements.delete(element);
      return;
    }

    stats.total++;

    if (info.id && settings.allowedVideos?.includes(info.id)) {
      markAllowed(element);
      return;
    }

    if (settings.enabled && shouldFilterOnPage()) {
      if (!isEducational(info)) {
        applyFilter(element, info);
      } else {
        markAllowed(element);
      }
    } else {
      removeFilter(element);
    }
  }

  function processAllVideos() {
    if (!settings.enabled) {
      document.querySelectorAll('[data-yt-study-filtered], .yt-study-allowed').forEach(el => {
        removeFilter(el);
        el.classList.remove('yt-study-allowed');
      });
      processedElements = new WeakSet();
      stats = { filtered: 0, allowed: 0, total: 0 };
      hideStatusBadge();
      sendStats();
      return;
    }

    log('Processing videos on:', getCurrentPage());
    stats = { filtered: 0, allowed: 0, total: 0 };
    processedElements = new WeakSet();

    document.querySelectorAll('[data-yt-study-filtered]').forEach(removeFilter);
    hideDistractions();
    document.querySelectorAll(VIDEO_SELECTORS).forEach(processElement);

    showStatusBadge();
    sendStats();
    log(`Done: ${stats.filtered} filtered, ${stats.allowed} allowed, ${stats.total} total`);
  }

  function hideDistractions() {
    const areas = settings.blockAreas || {};
    
    if (areas.shorts !== false) {
      document.querySelectorAll('ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer').forEach(el => {
        el.style.display = 'none';
      });
      document.querySelectorAll('ytd-guide-entry-renderer a[title="Shorts"]').forEach(el => {
        const parent = el.closest('ytd-guide-entry-renderer');
        if (parent) parent.style.display = 'none';
      });
      document.querySelectorAll('ytd-mini-guide-entry-renderer a[title="Shorts"]').forEach(el => {
        const parent = el.closest('ytd-mini-guide-entry-renderer');
        if (parent) parent.style.display = 'none';
      });
    }

    if (areas.trending !== false) {
      document.querySelectorAll('ytd-feed-filter-chip-bar-renderer').forEach(el => {
        el.style.display = 'none';
      });
    }

    if (areas.endscreen !== false) {
      document.querySelectorAll('.ytp-endscreen-content').forEach(el => {
        el.style.filter = 'blur(20px)';
        el.style.pointerEvents = 'none';
      });
    }
  }

  function showStatusBadge() {
    let badge = document.getElementById('yt-study-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'yt-study-badge';
      document.body.appendChild(badge);
    }
    badge.innerHTML = `<span>📚</span> Study Mode <span class="yt-study-badge-count">${stats.filtered}</span>`;
    badge.classList.add('visible');
  }

  function hideStatusBadge() {
    const badge = document.getElementById('yt-study-badge');
    if (badge) badge.classList.remove('visible');
  }

  function sendStats() {
    try {
      chrome.runtime.sendMessage({ type: 'STATS_UPDATE', stats: { ...stats } });
    } catch (e) {
      // Popup not open
    }
  }

  function setupObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (!settings.enabled) return;

      let shouldProcess = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          
          if (node.matches && node.matches(VIDEO_SELECTORS)) {
            setTimeout(() => processElement(node), 150);
            shouldProcess = true;
          }
          
          if (node.querySelectorAll) {
            node.querySelectorAll(VIDEO_SELECTORS).forEach(child => {
              setTimeout(() => processElement(child), 150);
              shouldProcess = true;
            });
          }
        }
      }
      
      if (shouldProcess) {
        hideDistractions();
        setTimeout(sendStats, 300);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setupNavigation() {
    let lastUrl = location.href;

    const handleNav = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        log('Navigation detected:', getCurrentPage());
        processedElements = new WeakSet();
        setTimeout(processAllVideos, 400);
        setTimeout(processAllVideos, 1200);
        setTimeout(processAllVideos, 3000);
      }
    };

    setInterval(handleNav, 600);
    window.addEventListener('popstate', handleNav);
    
    document.addEventListener('yt-navigate-finish', () => {
      log('yt-navigate-finish event');
      processedElements = new WeakSet();
      setTimeout(processAllVideos, 500);
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('Message received:', message.type);

    switch (message.type) {
      case 'SETTINGS_CHANGED':
        settings = { ...settings, ...message.settings };
        log('Settings updated:', settings);
        processedElements = new WeakSet();
        processAllVideos();
        sendResponse({ success: true });
        break;

      case 'RESTORE_ALL':
        log('Restoring all videos');
        settings.allowedVideos = [];
        chrome.storage.sync.set({ allowedVideos: [] });
        processedElements = new WeakSet();
        document.querySelectorAll('[data-yt-study-filtered], .yt-study-allowed').forEach(el => {
          removeFilter(el);
          el.classList.remove('yt-study-allowed');
        });
        stats = { filtered: 0, allowed: 0, total: 0 };
        if (settings.enabled) {
          setTimeout(processAllVideos, 100);
        }
        sendStats();
        sendResponse({ success: true });
        break;

      case 'GET_STATUS':
        sendResponse({ enabled: settings.enabled, stats: { ...stats }, page: getCurrentPage() });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
    return true;
  });

  function init() {
    log('Initializing YouTube Study Mode');

    chrome.storage.sync.get(null, (stored) => {
      settings = {
        enabled: false,
        filterMode: 'blur',
        keywords: ['tutorial', 'lecture', 'course', 'learn', 'study', 'education', 'explained', 'how to', 'guide', 'lesson'],
        channels: [],
        allowedVideos: [],
        blockAreas: { home: true, search: true, sidebar: true, shorts: true, trending: true, endscreen: true },
        ...stored
      };

      log('Settings loaded:', settings);

      setTimeout(processAllVideos, 600);
      setTimeout(processAllVideos, 1800);
      setTimeout(processAllVideos, 4000);

      setupObserver();
      setupNavigation();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
