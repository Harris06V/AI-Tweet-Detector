/**
 * Background Service Worker
 * Handles extension lifecycle, storage and communication between components
 */

// Install event
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('AI Tweet Detector installed');
    
    // Set default settings
    chrome.storage.sync.set({
      settings: {
        enabled: true,
        confidenceThreshold: 0.6,
        showConfidence: true,
        highlightColor: '#ff6b6b',
        skipVerified: false
      }
    });
    
    // Initialize stats
    chrome.storage.local.set({
      globalStats: {
        totalTweetsAnalyzed: 0,
        totalAIDetected: 0,
        detections: []
      }
    });
    
    // Open welcome page (optional)
    // chrome.tabs.create({ url: 'welcome.html' });
  } else if (details.reason === 'update') {
    console.log('AI Tweet Detector updated to version', chrome.runtime.getManifest().version);
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'AI_DETECTED') {
    handleAIDetection(request.data, sender.tab);
    sendResponse({ success: true });
  } else if (request.type === 'GET_GLOBAL_STATS') {
    getGlobalStats().then(stats => {
      sendResponse(stats);
    });
    return true; // Keep channel open for async response
  } else if (request.type === 'RESET_GLOBAL_STATS') {
    resetGlobalStats().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  return false;
});

/**
 * Handle AI detection event
 */
async function handleAIDetection(data, tab) {
  try {
    // Get current global stats
    const result = await chrome.storage.local.get(['globalStats']);
    const globalStats = result.globalStats || {
      totalTweetsAnalyzed: 0,
      totalAIDetected: 0,
      detections: []
    };
    
    // Update stats
    globalStats.totalAIDetected++;
    
    // Add detection to history (keep last 100)
    const detection = {
      username: data.username,
      confidence: data.confidence,
      reasons: data.reasons,
      timestamp: data.timestamp,
      url: tab ? tab.url : null
    };
    
    globalStats.detections.unshift(detection);
    if (globalStats.detections.length > 100) {
      globalStats.detections = globalStats.detections.slice(0, 100);
    }
    
    // Save updated stats
    await chrome.storage.local.set({ globalStats });
    
    // Update badge (optional)
    updateBadge(globalStats.totalAIDetected);
    
  } catch (error) {
    console.error('Error handling AI detection:', error);
  }
}

/**
 * Update extension badge
 */
function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Get global statistics
 */
async function getGlobalStats() {
  const result = await chrome.storage.local.get(['globalStats']);
  return result.globalStats || {
    totalTweetsAnalyzed: 0,
    totalAIDetected: 0,
    detections: []
  };
}

/**
 * Reset global statistics
 */
async function resetGlobalStats() {
  await chrome.storage.local.set({
    globalStats: {
      totalTweetsAnalyzed: 0,
      totalAIDetected: 0,
      detections: []
    }
  });
  
  updateBadge(0);
}

/**
 * Handle tab updates (optional: reset badge when navigating away from Twitter)
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // Check if we left Twitter/X
    if (tab.url && !tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
      // Could reset badge or perform cleanup
      // updateBadge(0);
    }
  }
});

// Periodic cleanup disabled - uncomment if needed
// Note: Requires 'alarms' permission in manifest.json
/*
try {
  if (chrome.alarms && chrome.alarms.create) {
    chrome.alarms.create('cleanup', { periodInMinutes: 1440 });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'cleanup') {
        cleanupOldDetections();
      }
    });
  }
} catch (error) {
  console.log('Alarms API not available:', error);
}

async function cleanupOldDetections() {
  const result = await chrome.storage.local.get(['globalStats']);
  const globalStats = result.globalStats;
  
  if (globalStats && globalStats.detections) {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    globalStats.detections = globalStats.detections.filter(
      detection => detection.timestamp > sevenDaysAgo
    );
    await chrome.storage.local.set({ globalStats });
  }
}
*/

// Log when service worker starts
console.log('AI Tweet Detector background service worker started');
