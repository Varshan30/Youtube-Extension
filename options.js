// src/options.js — robust version with debug logs and safer event wiring
(function() {
  'use strict';

  // DOM Elements
  const $ = id => document.getElementById(id);
  const keywordsInput = $('keywords');
  const channelsInput = $('channels');
  const blockHome = $('blockHome');
  const blockSearch = $('blockSearch');
  const blockSidebar = $('blockSidebar');
  const blockShorts = $('blockShorts');
  const blockTrending = $('blockTrending');
  const blockEndscreen = $('blockEndscreen');
  const saveBtn = $('saveBtn');
  const exportBtn = $('exportBtn');
  const importBtn = $('importBtn');
  const importFile = $('importFile');
  const resetBtn = $('resetBtn');
  const toast = $('toast');
  const toastText = $('toastText');
  const toastIcon = $('toastIcon');

  // Stats elements
  const totalFiltered = $('totalFiltered');
  const totalAllowed = $('totalAllowed');
  const keywordCount = $('keywordCount');
  const channelCount = $('channelCount');

  // Default settings
  const defaultSettings = {
    enabled: false,
    filterMode: 'blur',
    keywords: ['tutorial', 'lecture', 'course', 'learn', 'study', 'education', 'explained', 'how to', 'guide', 'lesson', 'exam', 'programming', 'coding', 'science', 'math'],
    channels: [],
    allowedVideos: [],
    blockAreas: {
      home: true,
      search: true,
      sidebar: true,
      shorts: true,
      trending: true,
      endscreen: true
    },
    stats: {
      totalFiltered: 0,
      totalAllowed: 0
    }
  };

  let currentSettings = { ...defaultSettings };

  // Show toast
  function showToast(message, isError = false) {
    if (toastText) toastText.textContent = message;
    if (toastIcon) toastIcon.textContent = isError ? '✗' : '✓';
    if (toast) {
      toast.classList.toggle('error', isError);
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }

  // Load settings
  function loadSettings() {
    chrome.storage.sync.get(null, (stored) => {
      currentSettings = { ...defaultSettings, ...stored };
      
      if (!currentSettings.blockAreas) {
        currentSettings.blockAreas = { ...defaultSettings.blockAreas };
      }
      if (!currentSettings.stats) {
        currentSettings.stats = { ...defaultSettings.stats };
      }

      updateUI();
    });
  }

  // Update UI from settings
  function updateUI() {
    // Keywords
    if (keywordsInput) {
      keywordsInput.value = (currentSettings.keywords || []).join('\n');
    }
    
    // Channels
    if (channelsInput) {
      channelsInput.value = (currentSettings.channels || []).join('\n');
    }

    // Block areas
    const areas = currentSettings.blockAreas || {};
    if (blockHome) blockHome.checked = areas.home !== false;
    if (blockSearch) blockSearch.checked = areas.search !== false;
    if (blockSidebar) blockSidebar.checked = areas.sidebar !== false;
    if (blockShorts) blockShorts.checked = areas.shorts !== false;
    if (blockTrending) blockTrending.checked = areas.trending !== false;
    if (blockEndscreen) blockEndscreen.checked = areas.endscreen !== false;

    // Stats
    updateStats();
  }

  // Update stats display
  function updateStats() {
    const stats = currentSettings.stats || {};
    if (totalFiltered) totalFiltered.textContent = stats.totalFiltered || 0;
    if (totalAllowed) totalAllowed.textContent = stats.totalAllowed || 0;
    if (keywordCount) keywordCount.textContent = (currentSettings.keywords || []).length;
    if (channelCount) channelCount.textContent = (currentSettings.channels || []).length;
  }

  // Get settings from UI
  function getSettingsFromUI() {
    const keywords = keywordsInput ? keywordsInput.value
      .split('\n')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean) : currentSettings.keywords;

    const channels = channelsInput ? channelsInput.value
      .split('\n')
      .map(c => c.trim())
      .filter(Boolean) : currentSettings.channels;

    const blockAreas = {
      home: blockHome ? blockHome.checked : true,
      search: blockSearch ? blockSearch.checked : true,
      sidebar: blockSidebar ? blockSidebar.checked : true,
      shorts: blockShorts ? blockShorts.checked : true,
      trending: blockTrending ? blockTrending.checked : true,
      endscreen: blockEndscreen ? blockEndscreen.checked : true
    };

    return {
      ...currentSettings,
      keywords,
      channels,
      blockAreas
    };
  }

  // Save settings
  function saveSettings() {
    currentSettings = getSettingsFromUI();
    
    chrome.storage.sync.set(currentSettings, () => {
      // Notify content scripts
      chrome.tabs.query({ url: ['*://www.youtube.com/*', '*://youtube.com/*'] }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_CHANGED',
            settings: currentSettings
          }).catch(() => {});
        });
      });
      
      updateStats();
      showToast('Settings saved successfully!');
    });
  }

  // Reset allowed videos
  function resetAllowedVideos() {
    currentSettings.allowedVideos = [];
    chrome.storage.sync.set({ allowedVideos: [] }, () => {
      chrome.tabs.query({ url: ['*://www.youtube.com/*', '*://youtube.com/*'] }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_ALL' }).catch(() => {});
        });
      });
      showToast('Allowed videos list cleared!');
    });
  }

  // Export settings
  function exportSettings() {
    const blob = new Blob([JSON.stringify(currentSettings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'youtube-study-mode-settings.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  importBtn.addEventListener('click', () => {
    importFile.click();
  });
  exportBtn.addEventListener('click', exportSettings);

  importFile.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedSettings = JSON.parse(e.target.result);
          currentSettings = { ...defaultSettings, ...importedSettings };
          chrome.storage.sync.set(currentSettings, () => {
            updateUI();
            chrome.tabs.query({ url: ['*://www.youtube.com/*', '*://youtube.com/*'] }, (tabs) => {
              tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                  type: 'SETTINGS_CHANGED',
                  settings: currentSettings
                }).catch(() => {});
              });
            });
            showToast('Settings imported successfully!');
          });
        } catch (error) {
          showToast('Error importing settings: ' + error.message, true);
        }
      };
      reader.readAsText(file);
    }
  });

  // Auto-save on toggle changes
  const toggles = [blockHome, blockSearch, blockSidebar, blockShorts, blockTrending, blockEndscreen];
  toggles.forEach(toggle => {
    toggle.addEventListener('change', saveSettings);
  });

  // Initialize
  loadSettings();
})();
