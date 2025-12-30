// src/popup.js — extra-defensive popup controller
(function() {
  'use strict';

  // DOM Elements
  const toggleStudy = document.getElementById('toggleStudy');
  const toggleCard = document.getElementById('toggleCard');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const filterModeBtns = document.querySelectorAll('.filter-mode-btn');
  const restoreBtn = document.getElementById('restoreBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toastIcon');
  const toastText = document.getElementById('toastText');
  
  // Blocking toggles
  const blockHome = document.getElementById('blockHome');
  const blockSearch = document.getElementById('blockSearch');
  const blockSidebar = document.getElementById('blockSidebar');
  const blockShorts = document.getElementById('blockShorts');
  const blockTrending = document.getElementById('blockTrending');
  const blockEndscreen = document.getElementById('blockEndscreen');

  // Stats elements
  const filteredCount = document.getElementById('filteredCount');
  const allowedCount = document.getElementById('allowedCount');
  const totalCount = document.getElementById('totalCount');

  // Default settings
  const defaultSettings = {
    enabled: false,
    filterMode: 'blur',
    keywords: ['tutorial', 'lecture', 'course', 'learn', 'study', 'education', 'explained', 'how to', 'guide', 'lesson', 'exam', 'programming', 'coding', 'science', 'math', 'physics', 'chemistry', 'biology', 'history', 'english', 'language'],
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

  let currentSettings = { ...defaultSettings };

  // Show toast notification
  function showToast(message, isError = false) {
    toastText.textContent = message;
    toastIcon.textContent = isError ? '✗' : '✓';
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // Load settings from storage
  function loadSettings() {
    chrome.storage.sync.get(null, (stored) => {
      currentSettings = { ...defaultSettings, ...stored };
      
      // Ensure blockAreas exists
      if (!currentSettings.blockAreas) {
        currentSettings.blockAreas = { ...defaultSettings.blockAreas };
      }

      updateUI();
      requestStats();
    });
  }

  // Update UI from settings
  function updateUI() {
    // Main toggle
    toggleStudy.checked = currentSettings.enabled;
    updateToggleCard(currentSettings.enabled);

    // Filter mode
    filterModeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === currentSettings.filterMode);
    });

    // Blocking options
    const areas = currentSettings.blockAreas || {};
    if (blockHome) blockHome.checked = areas.home !== false;
    if (blockSearch) blockSearch.checked = areas.search !== false;
    if (blockSidebar) blockSidebar.checked = areas.sidebar !== false;
    if (blockShorts) blockShorts.checked = areas.shorts !== false;
    if (blockTrending) blockTrending.checked = areas.trending !== false;
    if (blockEndscreen) blockEndscreen.checked = areas.endscreen !== false;
  }

  // Update toggle card appearance
  function updateToggleCard(enabled) {
    toggleCard.classList.toggle('active', enabled);
    statusBadge.className = `status-badge ${enabled ? 'on' : 'off'}`;
    statusText.textContent = `Study Mode is ${enabled ? 'ON' : 'OFF'}`;
  }

  // Save settings to storage
  function saveSettings(showNotification = false) {
    chrome.storage.sync.set(currentSettings, () => {
      // Notify all YouTube tabs
      chrome.tabs.query({ url: ['*://www.youtube.com/*', '*://youtube.com/*'] }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_CHANGED',
            settings: currentSettings
          }).catch(() => {});
        });
      });
      
      if (showNotification) {
        showToast('Settings saved!');
      }
    });
  }

  // Get block areas from UI
  function getBlockAreas() {
    return {
      home: blockHome ? blockHome.checked : true,
      search: blockSearch ? blockSearch.checked : true,
      sidebar: blockSidebar ? blockSidebar.checked : true,
      shorts: blockShorts ? blockShorts.checked : true,
      trending: blockTrending ? blockTrending.checked : true,
      endscreen: blockEndscreen ? blockEndscreen.checked : true
    };
  }

  // Request stats from active tab
  function requestStats() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url?.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' }, (response) => {
          if (chrome.runtime.lastError) {
            // Tab might not have content script yet
            return;
          }
          if (response?.stats) {
            updateStats(response.stats);
          }
        });
      }
    });
  }

  // Update stats display
  function updateStats(stats) {
    if (filteredCount) filteredCount.textContent = stats.filtered || 0;
    if (allowedCount) allowedCount.textContent = stats.allowed || 0;
    if (totalCount) totalCount.textContent = stats.total || 0;
  }

  // ==================== EVENT LISTENERS ====================

  // Main toggle
  if (toggleStudy) {
    toggleStudy.addEventListener('change', () => {
      currentSettings.enabled = toggleStudy.checked;
      updateToggleCard(currentSettings.enabled);
      saveSettings();
    });
  }

  // Filter mode buttons
  filterModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSettings.filterMode = btn.dataset.mode;
      saveSettings();
    });
  });

  // Blocking toggles
  const blockingToggles = [blockHome, blockSearch, blockSidebar, blockShorts, blockTrending, blockEndscreen].filter(Boolean);
  blockingToggles.forEach(toggle => {
    toggle.addEventListener('change', () => {
      currentSettings.blockAreas = getBlockAreas();
      saveSettings();
    });
  });

  // Restore All button - FIXED
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      // Clear allowed videos
      currentSettings.allowedVideos = [];
      
      // Save to storage
      chrome.storage.sync.set({ allowedVideos: [] }, () => {
        // Notify all YouTube tabs to restore
        chrome.tabs.query({ url: ['*://www.youtube.com/*', '*://youtube.com/*'] }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_ALL' }).catch(() => {});
          });
        });
        
        // Reset stats display
        updateStats({ filtered: 0, allowed: 0, total: 0 });
        
        // Show notification
        showToast('All videos restored!');
        
        // Request fresh stats after a delay
        setTimeout(requestStats, 500);
      });
    });
  }

  // Settings button
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Help link
  const helpLink = document.getElementById('helpLink');
  if (helpLink) {
    helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/your-repo/youtube-study-mode#help' });
    });
  }

  // Listen for stats updates from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATS_UPDATE' && message.stats) {
      updateStats(message.stats);
    }
    return true;
  });

  // Initialize
  loadSettings();
  
  // Refresh stats periodically
  setInterval(requestStats, 2000);
})();

