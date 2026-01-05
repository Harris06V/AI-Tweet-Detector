/**
 * AI Tweet Detector - Machine Learning Model
 * Uses a combination of pattern matching, NLP features, and scoring algorithms
 * to detect AI generated content in tweets
 */

class AIDetector {
  constructor() {
    this.patterns = null;
    this.stats = {
      tweetsAnalyzed: 0,
      aiDetected: 0,
      confidenceSum: 0
    };
    this.recentTweets = new Map(); // Store recent tweets for duplicate detection
    this.maxCacheSize = 500; // Maximum tweets to keep in cache
    
    // Known AI bot accounts
    this.knownAIBots = [
      'grok',
      'chatgpt',
      'claude',
      'gemini',
      'copilot',
      'bard',
      'metaai',
      'perplexity_ai',
      'anthropic',
      'openai'
    ];
    
    this.loadPatterns();
  }

  async loadPatterns() {
    try {
      const response = await fetch(chrome.runtime.getURL('ai-patterns.json'));
      this.patterns = await response.json();
    } catch (error) {
      console.error('Failed to load AI patterns:', error);
      this.patterns = this.getDefaultPatterns();
    }
  }

  getDefaultPatterns() {
    return {
      aiIndicatorWords: ['delve', 'tapestry', 'intricate', 'nuanced', 'multifaceted'],
      aiPhrasePatterns: ["it's not .+ it's .+", "as an AI"],
      punctuationPatterns: { excessiveEmDashes: 2 },
      spamIndicators: { excessiveHashtags: 5 }
    };
  }

  /**
   * Main detection function - analyzes tweet text and returns confidence score
   * @param {string} text - Tweet text to analyze
   * @param {Object} metadata - Additional metadata (username, account age, etc.)
   * @returns {Object} - { isAI: boolean, confidence: number, reasons: string[] }
   */
  async analyze(text, metadata = {}) {
    if (!this.patterns) {
      await this.loadPatterns();
    }

    // Check if this is a known AI bot account
    if (metadata.username) {
      const username = (metadata.username || '').toLowerCase().replace(/[@\s]/g, '');
      const isKnownBot = this.knownAIBots.some(bot => username.includes(bot) || bot.includes(username));
      
      if (isKnownBot) {
        this.stats.tweetsAnalyzed++;
        this.stats.aiDetected++;
        this.stats.confidenceSum += 1.0;
        
        return {
          isAI: true,
          confidence: 1.0,
          reasons: ['Official AI bot account'],
          features: { isKnownAIBot: true }
        };
      }
    }

    const features = this.extractFeatures(text, metadata);
    const score = this.calculateAIScore(features);
    // Flag as AI if ANY indicator is found (even a single match)
    const isAI = score.reasons.length > 0 || score.confidence > 0;

    this.stats.tweetsAnalyzed++;
    if (isAI) {
      this.stats.aiDetected++;
      this.stats.confidenceSum += score.confidence;
    }

    return {
      isAI,
      confidence: score.confidence,
      reasons: score.reasons,
      features
    };
  }

  /**
   * Extract linguistic and structural features from tweet text
   */
  extractFeatures(text, metadata) {
    const totalWords = this.countWords(text);
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    
    const features = {
      // Word-level features
      aiWordCount: this.countAIWords(text),
      totalWords: totalWords,
      
      // Phrase patterns
      aiPhraseMatches: this.matchAIPhrases(text),
      
      // Punctuation analysis
      emDashCount: (text.match(/—/g) || []).length,
      colonCount: (text.match(/:/g) || []).length,
      semicolonCount: (text.match(/;/g) || []).length,
      quotationCount: (text.match(/[""\"]/g) || []).length,
      
      // Structure
      hasBulletPoints: /[•·▪▫]/.test(text),
      hasNumberedList: /^\d+[\.\)]\s/m.test(text),
      paragraphCount: paragraphs.length,
      isLongThread: totalWords > 100 && paragraphs.length > 2,
      
      // Formal patterns
      hasCitations: /\b(Act of \d{4}|Article \d+|Section \d+|\d{4}\s+[A-Z][a-z]+\s+[A-Z][a-z]+)\b/.test(text),
      hasLegalJargon: this.hasLegalJargon(text),
      hasMixedFormalEmoji: this.hasMixedFormalEmoji(text),
      hasMultipleSources: this.hasMultipleSources(text),
      hasBalancedCommentary: this.hasBalancedCommentary(text),
      hasConversationalHook: this.hasConversationalHook(text),
      
      // Spam indicators
      hashtagCount: (text.match(/#\w+/g) || []).length,
      mentionCount: (text.match(/@\w+/g) || []).length,
      allCapsWords: (text.match(/\b[A-Z]{3,}\b/g) || []).length,
      emojiCount: this.countEmojis(text),
      hasExcessiveEmojis: this.hasExcessiveEmojis(text),
      
      // Generic responses
      hasGenericResponse: this.hasGenericResponse(text),
      
      // Bot/spam detection
      hasCryptoSpam: this.hasCryptoSpam(text),
      hasAdultContentPromo: this.hasAdultContentPromo(text),
      hasPromotionalContent: this.hasPromotionalContent(text),
      linkCount: (text.match(/https?:\/\/\S+/g) || []).length,
      hasSuspiciousLinks: this.hasSuspiciousLinks(text),
      
      // Stylometric features
      avgSentenceLength: this.getAvgSentenceLength(text),
      vocabularyDiversity: this.getVocabularyDiversity(text),
      formalityScore: this.getFormalityScore(text),
      
      // Metadata
      isNewAccount: metadata.accountAge ? metadata.accountAge < 90 : false,
      hasSuspiciousName: metadata.username ? this.isSuspiciousUsername(metadata.username) : false,
      hasAffiliateBadge: metadata.hasAffiliateBadge || false,
      hasEmojiUsername: metadata.displayName ? this.hasEmojiInUsername(metadata.displayName) : false,
      
      // Content quality
      isVeryShortTweet: totalWords <= 3 && text.length < 30,
      isShallowComment: this.isShallowComment(text),
      
      // Duplicate detection
      isDuplicateContent: this.checkDuplicateContent(text, metadata.username)
    };

    // Add current tweet to cache
    this.addToCache(text, metadata.username);

    return features;
  }

  /**
   * Calculate AI score based on weighted features
   */
  calculateAIScore(features) {
    let score = 0;
    const reasons = [];
    const weights = {
      aiWord: 0.25,
      aiPhrase: 0.30,
      punctuation: 0.15,
      structure: 0.12,
      spam: 0.15,
      botSpam: 0.35,
      stylometric: 0.18,
      metadata: 0.10
    };

    // AI word detection
    const aiWordRatio = features.aiWordCount / Math.max(features.totalWords, 1);
    if (aiWordRatio > 0.01) { // More than 1% AI words (much more aggressive)
      const aiWordScore = Math.min(aiWordRatio * 25, 1);
      score += aiWordScore * weights.aiWord;
      if (aiWordRatio > 0.02) {
        reasons.push(`High AI vocabulary usage (${(aiWordRatio * 100).toFixed(1)}%)`);
      }
    }

    // AI phrase patterns
    if (features.aiPhraseMatches.length > 0) {
      const phraseScore = Math.min(features.aiPhraseMatches.length * 0.6, 1);
      score += phraseScore * weights.aiPhrase;
      reasons.push(`AI phrase patterns detected: ${features.aiPhraseMatches.slice(0, 2).join(', ')}`);
    }

    // Punctuation patterns
    let punctScore = 0;
    if (features.emDashCount >= 1) {
      punctScore += 0.5;
      reasons.push(`Excessive em-dashes (${features.emDashCount})`);
    }
    if (features.colonCount >= 2) {
      punctScore += 0.4;
    }
    if (features.semicolonCount >= 1) {
      punctScore += 0.4;
    }
    if (features.quotationCount >= 3) {
      punctScore += 0.3;
      reasons.push('Excessive quotation marks');
    }
    score += Math.min(punctScore, 1) * weights.punctuation;

    // Structure
    let structScore = 0;
    if (features.hasBulletPoints) {
      structScore += 0.5;
      reasons.push('Bullet points in tweet');
    }
    if (features.hasNumberedList) {
      structScore += 0.5;
      reasons.push('Numbered list format');
    }
    if (features.isLongThread) {
      structScore += 0.6;
      reasons.push('Long multi-paragraph thread format');
    }
    if (features.hasCitations) {
      structScore += 0.7;
      reasons.push('Contains legal citations');
    }
    if (features.hasLegalJargon) {
      structScore += 0.6;
      reasons.push('Heavy legal/formal jargon');
    }
    if (features.hasMixedFormalEmoji) {
      structScore += 0.7;
      reasons.push('Formal text with emoji ending (bot pattern)');
    }
    if (features.hasMultipleSources) {
      structScore += 0.8;
      reasons.push('Multiple source citations (AI pattern)');
    }
    if (features.hasBalancedCommentary) {
      structScore += 0.7;
      reasons.push('Artificial both-sides balanced commentary');
    }
    if (features.hasConversationalHook) {
      structScore += 0.6;
      reasons.push('Question hook asking for engagement');
    }
    score += Math.min(structScore, 1) * weights.structure;

    // Spam indicators
    let spamScore = 0;
    if (features.hashtagCount > 3) {
      spamScore += 0.5;
      reasons.push(`Excessive hashtags (${features.hashtagCount})`);
    }
    if (features.mentionCount > 2) {
      spamScore += 0.5;
      reasons.push(`Excessive mentions (${features.mentionCount})`);
    }
    if (features.hasExcessiveEmojis) {
      spamScore += 0.6;
      reasons.push(`Excessive emojis detected (${features.emojiCount} emojis)`);
    }
    if (features.hasGenericResponse) {
      spamScore += 0.6;
      reasons.push('Generic/bot-like response');
    }
    score += Math.min(spamScore, 1) * weights.spam;

    // Bot/Spam detection (crypto, adult, promotional)
    let botSpamScore = 0;
    if (features.hasCryptoSpam) {
      botSpamScore += 0.6;
      reasons.push('Crypto/financial spam detected');
    }
    if (features.hasAdultContentPromo) {
      botSpamScore += 0.7;
      reasons.push('Adult content promotion detected');
    }
    if (features.hasPromotionalContent) {
      botSpamScore += 0.5;
      reasons.push('Promotional/engagement bait');
    }
    if (features.linkCount >= 2) {
      botSpamScore += 0.3;
      reasons.push(`Multiple links (${features.linkCount})`);
    }
    if (features.hasSuspiciousLinks) {
      botSpamScore += 0.4;
      reasons.push('Suspicious link patterns');
    }
    score += Math.min(botSpamScore, 1) * weights.botSpam;

    // Stylometric analysis
    let styleScore = 0;
    
    // Vocabulary diversity (AI can be less diverse or overly diverse)
    if (features.vocabularyDiversity < 0.75) {
      styleScore += 0.5;
      reasons.push('Low vocabulary diversity');
    }
    
    // Formality (AI tends to be more formal)
    if (features.formalityScore > 0.5) {
      styleScore += 0.5;
      reasons.push('High formality score');
    }
    
    score += Math.min(styleScore, 1) * weights.stylometric;

    // Metadata analysis
    let metaScore = 0;
    if (features.isNewAccount) {
      metaScore += 0.4;
      reasons.push('New account');
    }
    if (features.hasSuspiciousName) {
      metaScore += 0.6;
      reasons.push('Suspicious username pattern');
    }
    if (features.hasAffiliateBadge) {
      metaScore += 0.7;
      reasons.push('Account has affiliate badge');
    }
    if (features.hasEmojiUsername) {
      metaScore += 0.5;
      reasons.push('Emoji-heavy username');
    }
    score += Math.min(metaScore, 1) * weights.metadata;
    
    // Low-effort content detection
    if (features.isVeryShortTweet) {
      score += 0.6;
      reasons.push('Very short low-effort tweet');
    }
    if (features.isShallowComment) {
      score += 0.7;
      reasons.push('Shallow engagement-bait comment');
    }

    // Duplicate content detection
    if (features.isDuplicateContent) {
      score += 0.8; // Very strong indicator of bot behavior
      reasons.push('Duplicate/copied content detected');
    }

    return {
      confidence: Math.min(score, 1),
      reasons: reasons.slice(0, 5) // Top 5 reasons
    };
  }

  /**
   * Count AI indicator words in text
   */
  countAIWords(text) {
    const lowerText = text.toLowerCase();
    let count = 0;
    
    if (this.patterns && this.patterns.aiIndicatorWords) {
      for (const word of this.patterns.aiIndicatorWords) {
        const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'gi');
        const matches = lowerText.match(regex);
        if (matches) {
          count += matches.length;
        }
      }
    }
    
    return count;
  }

  /**
   * Count total words in text
   */
  countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Match AI phrase patterns
   */
  matchAIPhrases(text) {
    const matches = [];
    const lowerText = text.toLowerCase();
    
    if (this.patterns && this.patterns.aiPhrasePatterns) {
      for (const pattern of this.patterns.aiPhrasePatterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(lowerText)) {
            matches.push(pattern);
          }
        } catch (e) {
          // Invalid regex, skip
        }
      }
    }
    
    return matches;
  }

  /**
   * Count emojis in text
   */
  countEmojis(text) {
    // Comprehensive emoji regex covering more ranges
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu;
    const matches = text.match(emojiRegex);
    return matches ? matches.length : 0;
  }

  /**
   * Check for excessive emojis or emoji spam patterns
   */
  hasExcessiveEmojis(text) {
    const emojiCount = this.countEmojis(text);
    const totalChars = text.length;
    const words = this.countWords(text);
    
    // Check for various emoji spam patterns:
    // 1. More than 3 emojis total in a short tweet
    if (emojiCount > 3 && words < 20) {
      return true;
    }
    
    // 2. Emoji density is high (more than 10% of characters)
    const emojiDensity = emojiCount / Math.max(totalChars, 1);
    if (emojiDensity > 0.1 && emojiCount >= 3) {
      return true;
    }
    
    // 3. Tweet ends with 2+ emojis (common bot/spam pattern)
    const endsWithEmojis = /([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]){2,}\s*$/u.test(text);
    if (endsWithEmojis) {
      return true;
    }
    
    // 4. Multiple lines that are just emojis (like "🙏" on its own line)
    const lines = text.split(/\n+/);
    let emojiOnlyLines = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && /^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}])+$/u.test(trimmed)) {
        emojiOnlyLines++;
      }
    }
    if (emojiOnlyLines >= 1) {
      return true;
    }
    
    // 5. Repeated emojis (same emoji 2+ times in a row)
    const repeatedEmojis = /([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}])\1+/u.test(text);
    if (repeatedEmojis) {
      return true;
    }
    
    return false;
  }

  /**
   * Check for generic responses
   */
  hasGenericResponse(text) {
    const lowerText = text.toLowerCase().trim();
    
    if (!this.patterns || !this.patterns.spamIndicators || !this.patterns.spamIndicators.genericResponses) {
      return false;
    }
    
    const genericResponses = this.patterns.spamIndicators.genericResponses || [];
    
    // Check if the text matches any generic response (exact or contains)
    return genericResponses.some(response => {
      const lowerResponse = response.toLowerCase();
      // Exact match or match with just punctuation/emojis added
      return lowerText === lowerResponse ||
             lowerText.startsWith(lowerResponse + ' ') ||
             lowerText.startsWith(lowerResponse + '!') ||
             lowerText.startsWith(lowerResponse + '.') ||
             lowerText.includes(' ' + lowerResponse + ' ') ||
             lowerText.includes(' ' + lowerResponse + '!') ||
             lowerText.includes(' ' + lowerResponse);
    });
  }

  /**
   * Check for crypto/financial spam
   */
  hasCryptoSpam(text) {
    const lowerText = text.toLowerCase();
    if (!this.patterns || !this.patterns.spamIndicators) return false;
    
    const cryptoKeywords = this.patterns.spamIndicators.cryptoKeywords || [];
    let matchCount = 0;
    
    for (const keyword of cryptoKeywords) {
      if (text.includes(keyword) || lowerText.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }
    
    // 2+ crypto keywords = likely spam
    return matchCount >= 2;
  }

  /**
   * Check for adult content promotion
   */
  hasAdultContentPromo(text) {
    const lowerText = text.toLowerCase();
    if (!this.patterns || !this.patterns.spamIndicators) return false;
    
    const adultKeywords = this.patterns.spamIndicators.adultContentKeywords || [];
    
    return adultKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }

  /**
   * Check for promotional/engagement bait content
   */
  hasPromotionalContent(text) {
    const lowerText = text.toLowerCase();
    if (!this.patterns || !this.patterns.spamIndicators) return false;
    
    const promoPhrases = this.patterns.spamIndicators.promotionalPhrases || [];
    let matchCount = 0;
    
    for (const phrase of promoPhrases) {
      if (lowerText.includes(phrase.toLowerCase())) {
        matchCount++;
      }
    }
    
    // 2+ promotional phrases = likely spam
    return matchCount >= 2;
  }

  /**
   * Check for suspicious link patterns
   */
  hasSuspiciousLinks(text) {
    if (!this.patterns || !this.patterns.spamIndicators) return false;
    
    const suspiciousPatterns = this.patterns.spamIndicators.suspiciousLinkPatterns || [];
    
    for (const pattern of suspiciousPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) {
          return true;
        }
      } catch (e) {
        // Invalid regex, skip
      }
    }
    
    return false;
  }

  /**
   * Calculate average sentence length
   */
  getAvgSentenceLength(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 0;
    
    const totalWords = sentences.reduce((sum, sentence) => {
      return sum + sentence.split(/\s+/).filter(w => w.length > 0).length;
    }, 0);
    
    return totalWords / sentences.length;
  }

  /**
   * Calculate vocabulary diversity (unique words / total words)
   */
  getVocabularyDiversity(text) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return 0;
    
    const uniqueWords = new Set(words);
    return uniqueWords.size / words.length;
  }

  /**
   * Calculate formality score based on various indicators
   */
  getFormalityScore(text) {
    let formalityScore = 0;
    const lowerText = text.toLowerCase();
    
    // Formal words increase score
    const formalWords = ['therefore', 'furthermore', 'moreover', 'consequently', 'thus', 'hence'];
    formalWords.forEach(word => {
      if (lowerText.includes(word)) formalityScore += 0.15;
    });
    
    // Contractions decrease score
    const contractions = ['don\'t', 'can\'t', 'won\'t', 'shouldn\'t', 'wouldn\'t'];
    contractions.forEach(word => {
      if (lowerText.includes(word)) formalityScore -= 0.1;
    });
    
    // Slang decreases score
    const slang = ['lol', 'lmao', 'bruh', 'ngl', 'fr', 'tbh'];
    slang.forEach(word => {
      if (lowerText.includes(word)) formalityScore -= 0.15;
    });
    
    return Math.max(0, Math.min(1, 0.5 + formalityScore));
  }

  /**
   * Check if username matches suspicious patterns
   */
  isSuspiciousUsername(username) {
    const suspiciousPatterns = [
      /^[A-Z][a-z]+\d{4,}$/,  // e.g., John12345
      /^[A-Z][a-z]+_[A-Z][a-z]+\d+$/,  // e.g., John_Smith123
      /^\w+\d{8,}$/,  // Long number suffix
      /^\w+\d{1,2}$/,  // Short random number at end like "hib77"
      /^[a-z]+\d{1,3}$/  // Lowercase with few numbers
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(username));
  }

  /**
   * Check if username contains emojis (common bot indicator)
   */
  hasEmojiInUsername(username) {
    // Check for common emoji patterns in display names
    const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    return emojiPattern.test(username);
  }

  /**
   * Check if tweet is a shallow, low-effort comment
   */
  isShallowComment(text) {
    const normalized = text.toLowerCase().trim();
    const words = this.countWords(text);
    
    // Emoji-only tweets (common bot behavior)
    const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const textWithoutEmojis = text.replace(emojiPattern, '').trim();
    if (textWithoutEmojis.length === 0 && text.length > 0) {
      return true; // Only emojis, no text
    }
    
    // Single word responses
    if (words === 1 && normalized.length < 15) {
      return true;
    }
    
    // Very short tweets (under 4 words and under 30 chars)
    if (words <= 4 && text.length < 30) {
      // Check if it's just generic phrases
      const shallowPatterns = [
        /^(wow|amazing|nice|cool|great|good|beautiful|awesome|incredible|perfect|lovely|stunning)[\s!.]*$/i,
        /^(love|need|want|like)\s+(this|it|that|the\s+\w+)[\s!.]*$/i,
        /^oh\s+my\s+(god|gosh)[\s!.]*$/i,
        /^(so\s+)?(true|real|facts)[\s!.]*$/i,
        /^(yes|yeah|yep|nope|no|exactly)[\s!.]*$/i,
        /^the\s+best[\s!.]*$/i,
        /^bravo[\s!.]*$/i,
        /^(cool|good|nice)\s+(for|tactic|idea|dude|point)[\s!.]*$/i,
        /^(real|playa)\s+\w+[\s!.]*$/i
      ];
      
      return shallowPatterns.some(pattern => pattern.test(normalized));
    }
    
    return false;
  }

  /**
   * Check if text contains legal jargon (AI-generated political commentary indicator)
   */
  hasLegalJargon(text) {
    const legalTerms = [
      'jurisdiction', 'federal law', 'diplomatic immunity', 'statute',
      'enforcement', 'pursuant to', 'hereby', 'thereof', 'whereby',
      'act of', 'article', 'section', 'clause', 'protocol',
      'authorities', 'warrants', 'illegal order', 'federal authorities'
    ];
    
    const lowerText = text.toLowerCase();
    let count = 0;
    
    for (const term of legalTerms) {
      if (lowerText.includes(term)) {
        count++;
      }
    }
    
    // If 3+ legal terms appear, it's likely AI-generated formal commentary
    return count >= 3;
  }

  /**
   * Check for mixed formal/emoji pattern (formal text ending with emojis)
   */
  hasMixedFormalEmoji(text) {
    const words = this.countWords(text);
    
    // Must be longer than 50 words
    if (words < 50) return false;
    
    // Check if text contains emojis
    const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(text);
    if (!hasEmoji) return false;
    
    // Check formality score
    const formality = this.getFormalityScore(text);
    
    // If highly formal text (>0.6) contains emojis, it's suspicious
    return formality > 0.6;
  }

  /**
   * Check for multiple source citations (AI pattern)
   */
  hasMultipleSources(text) {
    const sources = [
      'bbc', 'cnn', 'reuters', 'al jazeera', 'the guardian', 'new york times',
      'washington post', 'associated press', 'bloomberg', 'forbes',
      'wall street journal', 'propphy', 'socialrails', 'times', 'un data',
      'per ', 'as per', 'according to', 'sources like'
    ];
    
    const lowerText = text.toLowerCase();
    let sourceCount = 0;
    
    for (const source of sources) {
      if (lowerText.includes(source)) {
        sourceCount++;
      }
    }
    
    // If 2+ sources cited, likely AI-generated balanced commentary
    return sourceCount >= 2;
  }

  /**
   * Check for artificial balanced commentary (presenting multiple viewpoints)
   */
  hasBalancedCommentary(text) {
    const balancedPhrases = [
      'in contrast', 'however', 'on the other hand', 'while',
      'perspectives vary', 'views vary', 'both', 'either',
      'some say', 'others argue', 'but also', 'yet'
    ];
    
    const lowerText = text.toLowerCase();
    let balanceCount = 0;
    
    for (const phrase of balancedPhrases) {
      if (lowerText.includes(phrase)) {
        balanceCount++;
      }
    }
    
    // If 2+ balanced phrases and text is longer, likely AI
    return balanceCount >= 2 && this.countWords(text) > 30;
  }

  /**
   * Check for conversational hooks asking for engagement
   */
  hasConversationalHook(text) {
    const hooks = [
      /what's your (main use case|take|view|thought|opinion)\?/i,
      /your take\?/i,
      /what do you think\?/i,
      /thoughts\?/i,
      /what part's the/i,
      /share .+ when you can/i,
      /what evidence sways you/i
    ];
    
    return hooks.some(hook => hook.test(text));
  }

  /**
   * Check if content is a duplicate or near-duplicate of a recent tweet
   */
  checkDuplicateContent(text, username) {
    const normalized = this.normalizeText(text);
    
    // Check for exact matches from different users
    for (const [cachedText, cachedUsername] of this.recentTweets.entries()) {
      if (cachedUsername !== username && cachedText === normalized) {
        return true; // Exact duplicate from different user
      }
      
      // Check for high similarity (catches variations like "deserves to go" vs "gonna go")
      if (cachedUsername !== username && this.calculateSimilarity(normalized, cachedText) > 0.60) {
        return true;
      }
      
      // Check for structural similarity (same sentence pattern with word swaps)
      if (cachedUsername !== username && this.checkStructuralSimilarity(normalized, cachedText)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Add tweet to cache for duplicate detection
   */
  addToCache(text, username) {
    const normalized = this.normalizeText(text);
    
    // Add to cache
    this.recentTweets.set(normalized, username);
    
    // Clean up cache if it gets too large
    if (this.recentTweets.size > this.maxCacheSize) {
      // Remove oldest entries (first 100)
      const iterator = this.recentTweets.keys();
      for (let i = 0; i < 100; i++) {
        const key = iterator.next().value;
        if (key) this.recentTweets.delete(key);
      }
    }
  }

  /**
   * Normalize text for comparison (remove extra whitespace, lowercase, etc.)
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  /**
   * Calculate similarity between two texts (0-1 scale)
   */
  calculateSimilarity(text1, text2) {
    const words1 = text1.split(' ');
    const words2 = text2.split(' ');
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    // Simple word overlap similarity
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Check structural similarity (same sentence pattern with word variations)
   * E.g., "He deserves to go viral" vs "He's gonna go viral"
   */
  checkStructuralSimilarity(text1, text2) {
    const words1 = text1.split(' ');
    const words2 = text2.split(' ');
    
    // Must be similar length (within 3 words)
    if (Math.abs(words1.length - words2.length) > 3) return false;
    
    // Short tweets - if 4+ words match, it's likely a template
    if (words1.length <= 8 && words2.length <= 8) {
      const matching = words1.filter(w => words2.includes(w)).length;
      return matching >= 4;
    }
    
    // For longer tweets, look for matching sequences
    let matchingSequences = 0;
    for (let i = 0; i < words1.length - 1; i++) {
      const sequence = `${words1[i]} ${words1[i + 1]}`;
      if (text2.includes(sequence)) {
        matchingSequences++;
      }
    }
    
    // If 50%+ of word pairs match, it's probably a template variation
    return matchingSequences >= (words1.length - 1) * 0.5;
  }

  /**
   * Get detector statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgConfidence: this.stats.aiDetected > 0 
        ? this.stats.confidenceSum / this.stats.aiDetected 
        : 0,
      detectionRate: this.stats.tweetsAnalyzed > 0
        ? this.stats.aiDetected / this.stats.tweetsAnalyzed
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      tweetsAnalyzed: 0,
      aiDetected: 0,
      confidenceSum: 0
    };
  }
}

// Make detector available globally for content script
if (typeof window !== 'undefined') {
  window.AIDetector = AIDetector;
}
