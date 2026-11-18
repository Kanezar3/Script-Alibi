import { computeSha256Hex } from './validation';

export const MAX_LINE_WINDOW = 120;
export const MAX_SNIPPET_CHARS = 3000;

export interface PrimaryTextCatalogEntry {
  id: string;
  label: string;
  era: string;
  url: string;
  suggestedQuery: string;
}

export const PRIMARY_TEXT_CATALOG: PrimaryTextCatalogEntry[] = [
  {
    id: 'wizard-of-oz-1900',
    label: 'The Wonderful Wizard of Oz (1900) — L. Frank Baum',
    era: 'Public Domain (1900)',
    url: 'https://raw.githubusercontent.com/GITenberg/The-Wonderful-Wizard-of-Oz_55/d19a4315b7c6f4471de8840a1a81609b34841dff/55.txt',
    suggestedQuery: 'silver shoes',
  },
  {
    id: 'dracula-1897',
    label: 'Dracula (1897) — Bram Stoker',
    era: 'Public Domain (1897)',
    url: 'https://raw.githubusercontent.com/cpwardell/dracula/0fd55e1ae21742ce3e28e26d78ebc46717642663/pg345.txt',
    suggestedQuery: 'knives',
  },
];

export interface SlicedSnippetResult {
  valid: boolean;
  reason?: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  windowLines: number;
  snippet: string;
  snippetLength: number;
  truncatedToMaxChars: boolean;
  snippetSha256: string;
}

/**
 * Mirrors contracts/script_alibi.py `_slice_snippet` byte-for-byte:
 * - Normalizes CRLF/CR to LF
 * - Slices 1-based [startLine, endLine]
 * - Collapses all whitespace via split/join(" ") and caps at MAX_SNIPPET_CHARS (3000)
 * - Computes UTF-8 SHA-256 hex digest
 */
export async function sliceAndHashPrimaryText(
  rawText: string,
  startLine: number,
  endLine: number
): Promise<SlicedSnippetResult> {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const totalLines = lines.length;

  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    return {
      valid: false,
      reason: 'Start and end lines must be integers.',
      totalLines,
      startLine,
      endLine,
      windowLines: 0,
      snippet: '',
      snippetLength: 0,
      truncatedToMaxChars: false,
      snippetSha256: '',
    };
  }

  if (startLine < 1 || endLine < startLine || startLine > totalLines) {
    return {
      valid: false,
      reason: `Line range must satisfy 1 <= start <= end and start <= ${totalLines}.`,
      totalLines,
      startLine,
      endLine,
      windowLines: 0,
      snippet: '',
      snippetLength: 0,
      truncatedToMaxChars: false,
      snippetSha256: '',
    };
  }

  const clampedEnd = Math.min(endLine, totalLines);
  const windowLines = clampedEnd - startLine + 1;
  if (windowLines > MAX_LINE_WINDOW) {
    return {
      valid: false,
      reason: `Line window (${windowLines}) exceeds contract MAX_LINE_WINDOW (${MAX_LINE_WINDOW}).`,
      totalLines,
      startLine,
      endLine: clampedEnd,
      windowLines,
      snippet: '',
      snippetLength: 0,
      truncatedToMaxChars: false,
      snippetSha256: '',
    };
  }

  const selected = lines.slice(startLine - 1, clampedEnd);
  const joined = selected.join(' ').trim();
  const collapsed = joined.length > 0 ? joined.split(/\s+/).join(' ') : '';
  const truncatedToMaxChars = collapsed.length > MAX_SNIPPET_CHARS;
  const snippet = collapsed.slice(0, MAX_SNIPPET_CHARS);
  const snippetSha256 = await computeSha256Hex(snippet);

  return {
    valid: true,
    totalLines,
    startLine,
    endLine: clampedEnd,
    windowLines,
    snippet,
    snippetLength: snippet.length,
    truncatedToMaxChars,
    snippetSha256,
  };
}

export interface LineSearchHit {
  lineNumber: number;
  text: string;
}

/**
 * Case-insensitive substring search across normalized lines of a primary text.
 */
export function searchPrimaryTextLines(
  rawText: string,
  query: string,
  maxHits = 40
): LineSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const hits: LineSearchHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(needle)) {
      hits.push({ lineNumber: i + 1, text: lines[i] });
      if (hits.length >= maxHits) break;
    }
  }
  return hits;
}
