// background.js — service worker
(function() {
  'use strict';

  const log = (...args) => console.log('[YT-Study:bg]', ...args);

  // Default settings
  const defaultSettings = {
    enabled: false,
    filterMode: 'blur',
    keywords: ['tutorial', 'lecture', 'course', 'learn', 'study', 'education', 'explained', 'how to', 'guide', 'lesson', 'exam', 'programming', 'coding'],
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

  // Initialize on install
  chrome.runtime.onInstalled.addListener(() => {
    log('YouTube Study Mode installed');
    
    chrome.storage.sync.get(null, (stored) => {
      const merged = { ...defaultSettings, ...stored };
      if (!merged.blockAreas) merged.blockAreas = defaultSettings.blockAreas;
      if (!merged.stats) merged.stats = defaultSettings.stats;
      chrome.storage.sync.set(merged);
      log('Settings initialized:', merged);
    });
  });

  // Handle messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('Message received:', message.type);

    if (message.type === 'STATS_UPDATE') {
      // Forward stats to popup
      chrome.runtime.sendMessage(message).catch(() => {});
      
      // Update persistent stats
      if (message.stats) {
        chrome.storage.sync.get(['stats'], (data) => {
          const stats = data.stats || { totalFiltered: 0, totalAllowed: 0 };
          stats.totalFiltered += message.stats.filtered || 0;
          stats.totalAllowed += message.stats.allowed || 0;
          chrome.storage.sync.set({ stats });
        });
      }
    }

    if (message.type === 'GET_SETTINGS') {
      chrome.storage.sync.get(null, (settings) => {
        sendResponse({ settings: { ...defaultSettings, ...settings } });
      });
      return true;
    }

    return true;
  });

  log('Background script loaded');
})();