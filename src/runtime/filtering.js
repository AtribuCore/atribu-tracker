// ---------------------------------------------------------------------------
// Traffic classification: block traditional bots, tag AI agents
// ---------------------------------------------------------------------------

import { storage } from "./storage.js";

// ---------------------------------------------------------------------------
// Traditional bots — block entirely (no tracking)
// ---------------------------------------------------------------------------

var BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|googlebot|bingbot|yandex|baidu|duckduckbot|sogou|exabot|ia_archiver|mj12bot|semrush|ahrefs|dotbot|rogerbot|screaming frog|sitebulb|archive\.org|facebookexternalhit|twitterbot|linkedinbot|pinterestbot|telegrambot|whatsapp|applebot|baiduspider/i;

export function isTraditionalBot() {
  try {
    var ua = navigator.userAgent || "";
    if (BOT_UA_PATTERN.test(ua)) return true;
    if (typeof navigator.webdriver !== "undefined" && navigator.webdriver)
      return true;
    if (window.__nightmare) return true;
    if (window._phantom || window.phantom) return true;
    if (window.Cypress) return true;
    if (window.__puppeteer) return true;
    if (window.__playwright) return true;
  } catch {}
  return false;
}

// ---------------------------------------------------------------------------
// AI agents — track but tag for visibility
// ---------------------------------------------------------------------------

var AI_AGENT_PATTERNS = [
  { pattern: /ChatGPT-User/i, name: "chatgpt" },
  { pattern: /GPTBot/i, name: "openai" },
  { pattern: /ClaudeBot|Anthropic-AI/i, name: "claude" },
  { pattern: /PerplexityBot/i, name: "perplexity" },
  { pattern: /Manus\b/i, name: "manus" },
  { pattern: /Google-Extended|Gemini/i, name: "gemini" },
  { pattern: /cohere-ai/i, name: "cohere" },
  { pattern: /CCBot/i, name: "commoncrawl_ai" },
  { pattern: /AI2Bot|Ai2Bot/i, name: "ai2" },
  { pattern: /Bytespider/i, name: "bytedance" },
  { pattern: /Amazonbot/i, name: "amazon" },
  { pattern: /Meta-ExternalAgent/i, name: "meta_ai" },
];

// Cached result (computed once at init)
var _aiAgentName = null;
var _aiAgentDetected = false;

export function detectAiAgent() {
  if (_aiAgentDetected) return _aiAgentName;
  _aiAgentDetected = true;
  try {
    var ua = navigator.userAgent || "";
    for (var i = 0; i < AI_AGENT_PATTERNS.length; i++) {
      if (AI_AGENT_PATTERNS[i].pattern.test(ua)) {
        _aiAgentName = AI_AGENT_PATTERNS[i].name;
        return _aiAgentName;
      }
    }
  } catch {}
  return null;
}

// ---------------------------------------------------------------------------
// Developer self-exclusion
// ---------------------------------------------------------------------------

export function isDeveloperExcluded() {
  try {
    return storage.getItem("atribu_ignore") === "true";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Page exclusion patterns
// ---------------------------------------------------------------------------

function matchWildcard(path, pattern) {
  // Convert wildcard pattern to regex: * matches any characters
  var escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp("^" + escaped + "$").test(path);
}

export function isIgnoredPage() {
  var patterns = window.ATRIBU_IGNORED_PAGES;
  if (!Array.isArray(patterns)) return false;
  var path = window.location.pathname;
  for (var i = 0; i < patterns.length; i++) {
    if (typeof patterns[i] === "string" && matchWildcard(path, patterns[i]))
      return true;
  }
  return false;
}

export function isConsentSuppressed() {
  return window.ATRIBU_SUPPRESS_TRACKING === true;
}

// ---------------------------------------------------------------------------
// Combined check: should this event be suppressed?
// ---------------------------------------------------------------------------

export function shouldSuppressEvent() {
  return isDeveloperExcluded() || isIgnoredPage() || isConsentSuppressed();
}

// ---------------------------------------------------------------------------
// AI agent payload enrichment
// ---------------------------------------------------------------------------

export function getAiAgentPayload() {
  var name = detectAiAgent();
  if (!name) return null;
  return {
    visitor_type: "ai_agent",
    ai_agent_name: name,
  };
}
