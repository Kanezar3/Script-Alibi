export interface UrlValidationResult {
  valid: boolean;
  sourceType?: 'github_commit' | 'wayback_immutable' | 'wikipedia_oldid';
  reason?: string;
}

const GITHUB_COMMIT_RAW_RE =
  /^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[0-9a-f]{40}\/.+$/i;

const WAYBACK_ID_RE =
  /^https:\/\/web\.archive\.org\/web\/\d{14}id_\/https?:\/\/.+$/i;

const WIKIPEDIA_OLDID_RE =
  /^https:\/\/en\.wikipedia\.org\/w\/api\.php\?[^#]*\baction=parse\b[^#]*\boldid=\d+\b/i;

const WIKIPEDIA_OLDID_ALT_RE =
  /^https:\/\/en\.wikipedia\.org\/w\/api\.php\?[^#]*\boldid=\d+\b[^#]*\baction=parse\b/i;

/**
 * Mirrors the on-chain Python allowlist rules for immutable literary sources.
 */
export function validateImmutableEvidenceUrl(rawUrl: string): UrlValidationResult {
  const url = rawUrl.trim();
  if (!url) {
    return { valid: false, reason: 'Evidence URL is required.' };
  }
  if (!url.startsWith('https://')) {
    return { valid: false, reason: 'Only HTTPS immutable URLs are permitted.' };
  }
  if (GITHUB_COMMIT_RAW_RE.test(url)) {
    return { valid: true, sourceType: 'github_commit' };
  }
  if (WAYBACK_ID_RE.test(url)) {
    return { valid: true, sourceType: 'wayback_immutable' };
  }
  if (WIKIPEDIA_OLDID_RE.test(url) || WIKIPEDIA_OLDID_ALT_RE.test(url)) {
    return { valid: true, sourceType: 'wikipedia_oldid' };
  }
  return {
    valid: false,
    reason:
      'URL must be commit-pinned raw.githubusercontent.com (<40-hex-sha>), web.archive.org/web/<14-digit>id_/, or en.wikipedia.org/w/api.php?action=parse&oldid=<id>.',
  };
}

export interface SnippetHighlightSegments {
  before: string;
  match: string;
  after: string;
  found: boolean;
}

/**
 * Locates the verbatim evidence_quote inside the literary snippet for archival highlighting.
 */
export function splitSnippetAroundQuote(
  snippet: string,
  evidenceQuote: string
): SnippetHighlightSegments {
  if (!snippet || !evidenceQuote || evidenceQuote.trim().length === 0) {
    return { before: snippet, match: '', after: '', found: false };
  }

  const exactIdx = snippet.indexOf(evidenceQuote);
  if (exactIdx !== -1) {
    return {
      before: snippet.slice(0, exactIdx),
      match: snippet.slice(exactIdx, exactIdx + evidenceQuote.length),
      after: snippet.slice(exactIdx + evidenceQuote.length),
      found: true,
    };
  }

  // Fallback: normalize CRLF/whitespace difference only for visual alignment check
  const normalizedSnippet = snippet.replace(/\r\n/g, '\n');
  const normalizedQuote = evidenceQuote.replace(/\r\n/g, '\n');
  const normIdx = normalizedSnippet.indexOf(normalizedQuote);
  if (normIdx !== -1) {
    return {
      before: normalizedSnippet.slice(0, normIdx),
      match: normalizedSnippet.slice(normIdx, normIdx + normalizedQuote.length),
      after: normalizedSnippet.slice(normIdx + normalizedQuote.length),
      found: true,
    };
  }

  return { before: snippet, match: '', after: '', found: false };
}

/**
 * Computes lowercase hex SHA-256 of normalized UTF-8 text in the browser.
 */
export async function computeSha256Hex(input: string): Promise<string> {
  const normalized = input.replace(/\r\n/g, '\n');
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function truncateMiddle(value: string, head = 10, tail = 8): string {
  if (!value || value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
