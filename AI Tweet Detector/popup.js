/**
 * Popup Script - Handles UI interactions and settings
 */

// Elements
const enableToggle = document.getElementById('enableToggle');
const confidenceThreshold = document.getElementById('confidenceThreshold');
const showConfidence = document.getElementById('showConfidence');
const highlightColor = document.getElementById('highlightColor');
const rescanBtn = document.getElementById('rescanBtn');
const resetStatsBtn = document.getElementById('resetStatsBtn');
const notification = document.getElementById('notification');

// Stats elements
const tweetsAnalyzed = document.getElementById('tweetsAnalyzed');
const aiDetected = document.getElementById('aiDetected');
const detectionRate = document.getElementById('detectionRate');
const avgConfidence = document.getElementById('avgConfidence');
const progressFill = document.getElementById('progressFill');

// Load settings and stats on popup open
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadStats();
  
  // Set up auto-refresh for stats
  setInterval(loadStats, 2000); // Refresh every 2 seconds
});

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['settings']);
    
    if (result.settings) {
      const settings = result.settings;
      enableToggle.checked = settings.enabled !== false;
      confidenceThreshold.value = (settings.confidenceThreshold || 0.6) * 100;
      showConfidence.checked = settings.showConfidence !== false;
      highlightColor.value = settings.highlightColor || '#ff6b6b';
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  const settings = {
    enabled: enableToggle.checked,
    confidenceThreshold: parseInt(confidenceThreshold.value) / 100,
    showConfidence: showConfidence.checked,
    highlightColor: highlightColor.value
  };
  
  try {
    await chrome.storage.sync.set({ settings });
    showNotification('Settings saved!', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showNotification('Error saving settings', 'error');
  }
}

/**
 * Load statistics from content script
 */
async function loadStats() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if we're on Twitter/X
    if (!tab.url || (!tab.url.includes('twitter.com') && !tab.url.includes('x.com'))) {
      tweetsAnalyzed.textContent = 'N/A';
      aiDetected.textContent = 'N/A';
      detectionRate.textContent = 'Visit Twitter/X';
      avgConfidence.textContent = 'N/A';
      progressFill.style.width = '0%';
      return;
    }
    
    // Request stats from content script
    chrome.tabs.sendMessage(tab.id, { type: 'GET_STATS' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Content script not ready yet');
        return;
      }
      
      if (response) {
        updateStatsDisplay(response);
      }
    });
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

/**
 * Update stats display
 */
function updateStatsDisplay(stats) {
  tweetsAnalyzed.textContent = stats.tweetsAnalyzed || 0;
  aiDetected.textContent = stats.aiDetected || 0;
  
  const rate = stats.detectionRate || 0;
  detectionRate.textContent = `${(rate * 100).toFixed(1)}%`;
  progressFill.style.width = `${rate * 100}%`;
  
  const avgConf = stats.avgConfidence || 0;
  avgConfidence.textContent = `${(avgConf * 100).toFixed(1)}%`;
}

/**
 * Show notification message
 */
function showNotification(message, type = 'success') {
  notification.textContent = message;
  notification.className = `notification ${type} show`;
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

/**
 * Rescan tweets
 */
async function rescanTweets() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || (!tab.url.includes('twitter.com') && !tab.url.includes('x.com'))) {
      showNotification('Please navigate to Twitter/X first', 'error');
      return;
    }
    
    rescanBtn.disabled = true;
    rescanBtn.textContent = 'Scanning...';
    
    chrome.tabs.sendMessage(tab.id, { type: 'RESCAN' }, (response) => {
      rescanBtn.disabled = false;
      rescanBtn.textContent = 'Rescan Tweets';
      
      if (chrome.runtime.lastError) {
        showNotification('Error rescanning tweets', 'error');
        return;
      }
      
      if (response && response.success) {
        showNotification('Tweets rescanned successfully!', 'success');
        setTimeout(loadStats, 1000);
      }
    });
  } catch (error) {
    console.error('Error rescanning:', error);
    rescanBtn.disabled = false;
    rescanBtn.textContent = 'Rescan Tweets';
    showNotification('Error rescanning tweets', 'error');
  }
}

/**
 * Reset statistics
 */
async function resetStats() {
  if (!confirm('Are you sure you want to reset all statistics?')) {
    return;
  }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, { type: 'RESET_STATS' }, (response) => {
      if (chrome.runtime.lastError) {
        showNotification('Error resetting stats', 'error');
        return;
      }
      
      if (response && response.success) {
        showNotification('Statistics reset!', 'success');
        loadStats();
      }
    });
  } catch (error) {
    console.error('Error resetting stats:', error);
    showNotification('Error resetting stats', 'error');
  }
}

// Event listeners
enableToggle.addEventListener('change', saveSettings);
confidenceThreshold.addEventListener('change', saveSettings);
showConfidence.addEventListener('change', saveSettings);
highlightColor.addEventListener('change', saveSettings);
rescanBtn.addEventListener('click', rescanTweets);
resetStatsBtn.addEventListener('click', resetStats);

// About and Help links
document.getElementById('aboutLink').addEventListener('click', (e) => {
  e.preventDefault();
  alert('AI Tweet Detector v2.0\n\nDetects AI-generated tweets using machine learning and pattern analysis.\n\nFeatures:\n- Real-time tweet analysis\n- Pattern matching for common AI phrases\n- Stylometric analysis\n- Confidence scoring\n- Customizable detection threshold');
});

document.getElementById('helpLink').addEventListener('click', (e) => {
  e.preventDefault();
  alert('How to use:\n\n1. Navigate to Twitter/X\n2. The extension will automatically scan tweets\n3. AI-detected tweets will be highlighted\n4. Adjust settings to customize detection\n5. Use "Rescan Tweets" to re-analyze the page\n\nTips:\n- Higher confidence threshold = fewer false positives\n- Lower threshold = more detections\n- Hover over badges to see detection reasons');
});
