'use client';

const STORAGE_KEY = 'mdify_recent_sessions_v1';
const LEGACY_STORAGE_KEY = 'markdify_recent_sessions_v1';
const MAX_SESSIONS = 5;

/**
 * Safely retrieve the last 5 conversion sessions from browser local storage
 */
export function getRecentSessions() {
  if (typeof window === 'undefined') return [];
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_SESSIONS) : [];
  } catch (err) {
    console.warn('Failed to read recent sessions from localStorage:', err);
    return [];
  }
}

/**
 * Save a newly completed conversion session, keeping strictly the last 5
 */
export function saveRecentSession(item) {
  if (typeof window === 'undefined' || !item || !item.content) return [];
  try {
    const current = getRecentSessions();

    const newSession = {
      id: item.id || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: item.timestamp || Date.now(),
      filename: item.filename || `${item.original_name || 'document'}.md`,
      original_name: item.original_name || item.filename || 'Converted Document',
      content: item.content,
      tokens_est: item.tokens_est || Math.round(item.content.length / 4),
      quality_score: item.quality_score || 92,
      profile: item.profile || 'Standard',
      fileSize: item.fileSize || null,
    };

    // Filter out duplicate by id or identical content/original_name
    const filtered = current.filter(
      (s) => s.id !== newSession.id && s.original_name !== newSession.original_name
    );

    // Prepend newest session and cap at MAX_SESSIONS (5)
    const updated = [newSession, ...filtered].slice(0, MAX_SESSIONS);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to save session to localStorage:', err);
    return [];
  }
}

/**
 * Remove a specific session by ID
 */
export function deleteRecentSession(sessionId) {
  if (typeof window === 'undefined' || !sessionId) return [];
  try {
    const current = getRecentSessions();
    const updated = current.filter((s) => s.id !== sessionId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to delete session from localStorage:', err);
    return [];
  }
}

/**
 * Clear all stored conversion sessions
 */
export function clearAllRecentSessions() {
  if (typeof window === 'undefined') return [];
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return [];
  } catch (err) {
    console.warn('Failed to clear sessions from localStorage:', err);
    return [];
  }
}

/**
 * Sample session for immediate testing if history is empty
 */
export function generateSampleSession() {
  const sampleContent = `# Quarterly Operations & Technical Report
*Generated via MDify Engine (High Fidelity LLM Profile)*

## Executive Summary
This document demonstrates high-quality Markdown conversion preserving complex formatting, statistical metrics, and syntax-highlighted code blocks.

### Performance Highlights
| Metric | Q2 Baseline | Q3 Target | Achieved | Status |
| :--- | :--- | :--- | :--- | :--- |
| Processing Throughput | 420 doc/hr | 800 doc/hr | **940 doc/hr** | Optimal |
| Token Compression | 18.2% | 24.0% | **27.5%** | Exceeded |
| Formatting Retention | 96.1% | 98.5% | **99.2%** | Passing |

> "MDify converted 240+ multi-page PDF documents without stripping hierarchical headers or tabular alignment."

### Python API Integration
\`\`\`python
from markitdown import MarkItDown

# Initialize converter
converter = MarkItDown(enable_plugins=True)
result = converter.convert("quarterly_report.pdf")

# Markdown text ready for RAG pipelines
print(f"Tokens saved: ~{len(result.text_content) // 4}")
\`\`\`

### System Configuration
\`\`\`json
{
  "system": "MDify-v2",
  "engine": "markitdown",
  "status": "online",
  "cached_sessions": 5,
  "syntax_highlighting": "prism.js"
}
\`\`\`
`;

  return {
    id: `sample_${Date.now()}`,
    timestamp: Date.now(),
    filename: 'quarterly_report_sample.md',
    original_name: 'Quarterly_Report_Q3.pdf',
    content: sampleContent,
    tokens_est: 340,
    quality_score: 98,
    profile: 'Academic/Research',
    fileSize: 145000,
  };
}
