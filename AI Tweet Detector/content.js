/**
 * Content Script - Monitors Twitter/X DOM and analyzes tweets in real-time
 */

// Initialize detector
const detector = new AIDetector();
const processedTweets = new Set();
let settings = {
  enabled: true,
  confidenceThreshold: 0.6,
  showConfidence: true,
  highlightColor: '#ff6b6b'
};

// Load settings from storage
chrome.storage.sync.get(['settings'], (result) => {
  if (result.settings) {
    settings = { ...settings, ...result.settings };
  }
});

/**
 * Main observer to watch for new tweets
 */
function initializeTweetObserver() {
  const observer = new MutationObserver((mutations) => {
    if (!settings.enabled) return;

    // Find all tweet elements
    const tweets = findTweetElements();
    tweets.forEach(tweetElement => {
      analyzeTweetElement(tweetElement);
    });
  });

  // Observe the main timeline
  const config = { childList: true, subtree: true };
  const targetNode = document.querySelector('body');
  
  if (targetNode) {
    observer.observe(targetNode, config);
    console.log('AI Tweet Detector: Observer initialized');
  }

  // Initial scan of existing tweets
  setTimeout(() => {
    const tweets = findTweetElements();
    tweets.forEach(tweetElement => {
      analyzeTweetElement(tweetElement);
    });
  }, 2000);
}

/**
 * Find tweet elements in the DOM
 * Twitter/X uses data-testid="tweet" for tweet containers
 */
function findTweetElements() {
  // Multiple selectors for compatibility
  const selectors = [
    '[data-testid="tweet"]',
    'article[role="article"]',
    '[data-testid="tweetText"]'
  ];

  const tweets = [];
  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      // Find the parent article element if we selected a child
      const tweetContainer = el.closest('article') || el;
      if (!tweets.includes(tweetContainer)) {
        tweets.push(tweetContainer);
      }
    });
  });

  return tweets;
}

/**
 * Extract tweet data from DOM element
 */
function extractTweetData(tweetElement) {
  try {
    // Extract tweet text
    const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
    const text = textElement ? textElement.innerText : '';

    // Extract username handle (e.g., @grok -> grok)
    const usernameHandleElement = tweetElement.querySelector('[data-testid="User-Name"] a[href*="/"]');
    let username = '';
    if (usernameHandleElement) {
      const href = usernameHandleElement.getAttribute('href') || '';
      const match = href.match(/\/([^/]+)$/);
      if (match) username = match[1];
    }
    
    // Get display name (may contain emojis)
    const displayNameElement = tweetElement.querySelector('[data-testid="User-Name"] span');
    const displayName = displayNameElement ? displayNameElement.innerText : username;

    // Extract timestamp to estimate account activity
    const timeElement = tweetElement.querySelector('time');
    const timestamp = timeElement ? new Date(timeElement.getAttribute('datetime')) : null;

    // Try to detect account age indicators (this is limited from DOM)
    const verifiedBadge = tweetElement.querySelector('[data-testid="icon-verified"]');
    const isVerified = !!verifiedBadge;
    
    // Detect affiliate/organization badges
    // Look for all verification badges in the user area
    const userNameSection = tweetElement.querySelector('[data-testid="User-Name"]');
    let hasAffiliateBadge = false;
    
    if (userNameSection) {
      // Count all SVG badges in the username section
      const allBadges = userNameSection.querySelectorAll('svg');
      
      // If there are multiple badges, or a badge that's not the standard verified checkmark
      allBadges.forEach(badge => {
        const ariaLabel = (badge.getAttribute('aria-label') || '').toLowerCase();
        const testId = badge.getAttribute('data-testid') || '';
        
        // Flag if it's a verified organization, affiliate, or any non-standard badge
        if (ariaLabel.includes('verified organization') ||
            ariaLabel.includes('affiliate') ||
            ariaLabel.includes('government') ||
            testId.includes('affiliates') ||
            // Gold/square verified badge (not the standard blue checkmark)
            (ariaLabel.includes('verified') && testId !== 'icon-verified')) {
          hasAffiliateBadge = true;
        }
      });
      
      // Also flag if there are multiple badges (verified + something else)
      if (allBadges.length > 1) {
        hasAffiliateBadge = true;
      }
    }
    
    // Debug logging
    if (hasAffiliateBadge) {
      console.log('AFFILIATE/ORG BADGE DETECTED:', username);
    }

    // Count hashtags and mentions from the text
    const hashtagCount = (text.match(/#\w+/g) || []).length;
    const mentionCount = (text.match(/@\w+/g) || []).length;

    return {
      text,
      username,
      displayName,
      timestamp,
      isVerified,
      hasAffiliateBadge,
      hashtagCount,
      mentionCount,
      element: tweetElement
    };
  } catch (error) {
    console.error('Error extracting tweet data:', error);
    return null;
  }
}

/**
 * Analyze a tweet element
 */
async function analyzeTweetElement(tweetElement) {
  // Check if already processed
  const tweetId = getTweetId(tweetElement);
  if (processedTweets.has(tweetId)) {
    return;
  }

  const tweetData = extractTweetData(tweetElement);
  if (!tweetData || !tweetData.text || tweetData.text.length < 1) {
    return; // Skip tweets without text
  }

  // Skip verified accounts if setting enabled (future feature)
  if (tweetData.isVerified && settings.skipVerified) {
    processedTweets.add(tweetId);
    return;
  }

  // Prepare metadata for analysis
  const metadata = {
    username: tweetData.username, // Use actual @handle for bot detection
    displayName: tweetData.displayName, // Use display name for emoji detection
    timestamp: tweetData.timestamp,
    isVerified: tweetData.isVerified,
    hasAffiliateBadge: tweetData.hasAffiliateBadge
  };

  // Analyze the tweet
  const result = await detector.analyze(tweetData.text, metadata);

  // Debug logging
  console.log('Tweet analyzed:', {
    text: tweetData.text.substring(0, 100),
    confidence: result.confidence,
    isAI: result.isAI,
    threshold: settings.confidenceThreshold,
    reasons: result.reasons
  });

  // Store result
  processedTweets.add(tweetId);

  // If AI detected (any match), highlight the tweet immediately
  if (result.isAI) {
    highlightTweet(tweetElement, result);
    
    // Send to background script for stats
    chrome.runtime.sendMessage({
      type: 'AI_DETECTED',
      data: {
        username: tweetData.username,
        confidence: result.confidence,
        reasons: result.reasons,
        timestamp: Date.now()
      }
    });
  }
}

/**
 * Get unique ID for tweet element
 */
function getTweetId(tweetElement) {
  // Try to find a unique identifier
  const link = tweetElement.querySelector('a[href*="/status/"]');
  if (link) {
    const match = link.href.match(/\/status\/(\d+)/);
    if (match) return match[1];
  }
  
  // Fallback to generating ID from text content
  const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
  const text = textElement ? textElement.innerText : '';
  return `${text.substring(0, 50)}-${Date.now()}`;
}

/**
 * Highlight tweet as AI-generated
 */
function highlightTweet(tweetElement, result) {
  // Add AI indicator class
  tweetElement.classList.add('ai-detected-tweet');
  tweetElement.setAttribute('data-ai-confidence', result.confidence.toFixed(2));

  // Create and inject AI indicator badge
  if (!tweetElement.querySelector('.ai-detector-badge')) {
    const badge = createBadge(result);
    
    // Find the best place to insert the badge (after username/time)
    const insertPoint = tweetElement.querySelector('[data-testid="User-Name"]') || 
                       tweetElement.querySelector('[data-testid="tweetText"]');
    
    if (insertPoint) {
      // Insert after the user info
      const parent = insertPoint.parentElement;
      if (parent) {
        parent.insertBefore(badge, insertPoint.nextSibling);
      }
    }
  }

  // Apply visual highlighting
  tweetElement.style.borderLeft = `4px solid ${settings.highlightColor}`;
  tweetElement.style.backgroundColor = `${settings.highlightColor}15`;
}

/**
 * Create AI detection badge
 */
function createBadge(result) {
  const badge = document.createElement('div');
  badge.className = 'ai-detector-badge';
  
  const confidencePercent = Math.round(result.confidence * 100);
  const confidenceLevel = confidencePercent >= 90 ? 'high' : 
                         confidencePercent >= 80 ? 'medium' : 'low';
  
  badge.innerHTML = `
    <div class="ai-badge-text">
      <span class="ai-badge-label">AI Generated</span>
      ${settings.showConfidence ? `<span class="ai-badge-confidence confidence-${confidenceLevel}">${confidencePercent}%</span>` : ''}
    </div>
    <div class="ai-badge-tooltip">
      <strong>AI Detection Confidence: ${confidencePercent}%</strong>
      <ul>
        ${result.reasons.map(reason => `<li>${reason}</li>`).join('')}
      </ul>
    </div>
  `;
  
  return badge;
}

/**
 * Listen for settings updates
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    settings = { ...settings, ...changes.settings.newValue };
    
    // If disabled, remove all highlights
    if (!settings.enabled) {
      removeAllHighlights();
    }
  }
});

/**
 * Remove all AI highlights
 */
function removeAllHighlights() {
  const highlightedTweets = document.querySelectorAll('.ai-detected-tweet');
  highlightedTweets.forEach(tweet => {
    tweet.classList.remove('ai-detected-tweet');
    tweet.style.borderLeft = '';
    tweet.style.backgroundColor = '';
    
    const badge = tweet.querySelector('.ai-detector-badge');
    if (badge) {
      badge.remove();
    }
  });
  
  processedTweets.clear();
}

/**
 * Listen for messages from popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_STATS') {
    const stats = detector.getStats();
    sendResponse(stats);
  } else if (request.type === 'RESET_STATS') {
    detector.resetStats();
    processedTweets.clear();
    sendResponse({ success: true });
  } else if (request.type === 'RESCAN') {
    removeAllHighlights();
    const tweets = findTweetElements();
    tweets.forEach(tweetElement => {
      analyzeTweetElement(tweetElement);
    });
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open for async response
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTweetObserver);
} else {
  initializeTweetObserver();
}

console.log('AI Tweet Detector v2.0 loaded');
