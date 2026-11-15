import { describe, expect, it } from 'vitest';
import {
  splitSnippetAroundQuote,
  validateImmutableEvidenceUrl,
} from '../validation';
import {
  isTerminalLifecycleStage,
  mapGenLayerStatusToLifecycle,
} from '../txTracker';
import { normalizeProofBundle } from '../proofAdapter';

describe('validateImmutableEvidenceUrl', () => {
  it('accepts commit-pinned raw.githubusercontent.com URLs with 40-hex SHA', () => {
    const sha = 'a'.repeat(40);
    const res = validateImmutableEvidenceUrl(
      `https://raw.githubusercontent.com/org/repo/${sha}/books/oz.txt`
    );
    expect(res.valid).toBe(true);
    expect(res.sourceType).toBe('github_commit');
  });

  it('rejects mutable branch raw.githubusercontent.com URLs', () => {
    const res = validateImmutableEvidenceUrl(
      'https://raw.githubusercontent.com/org/repo/main/books/oz.txt'
    );
    expect(res.valid).toBe(false);
  });

  it('accepts wayback id_ immutable URLs and wikipedia oldid parse URLs', () => {
    expect(
      validateImmutableEvidenceUrl(
        'https://web.archive.org/web/20240101120000id_/https://example.com/oz.txt'
      ).valid
    ).toBe(true);
    expect(
      validateImmutableEvidenceUrl(
        'https://en.wikipedia.org/w/api.php?action=parse&oldid=12345678&prop=wikitext'
      ).valid
    ).toBe(true);
  });
});

describe('splitSnippetAroundQuote', () => {
  it('highlights verbatim quote inside literary context', () => {
    const snippet = 'Now the Silver Shoes had pointed toes and fitted Dorothy well.';
    const quote = 'Silver Shoes had pointed toes';
    const seg = splitSnippetAroundQuote(snippet, quote);
    expect(seg.found).toBe(true);
    expect(seg.before).toBe('Now the ');
    expect(seg.match).toBe(quote);
    expect(seg.after).toBe(' and fitted Dorothy well.');
  });

  it('handles missing quote gracefully', () => {
    const seg = splitSnippetAroundQuote('Plain text', 'Nonexistent quote');
    expect(seg.found).toBe(false);
    expect(seg.before).toBe('Plain text');
  });
});

describe('mapGenLayerStatusToLifecycle', () => {
  it('maps Accepted to open appeal window and Finalized to terminal stage', () => {
    const accepted = mapGenLayerStatusToLifecycle('ACCEPTED');
    expect(accepted.stage).toBe('accepted');
    expect(accepted.appealWindow).toBe('open');
    expect(isTerminalLifecycleStage(accepted.stage)).toBe(false);

    const finalized = mapGenLayerStatusToLifecycle('FINALIZED', 'FINISHED_WITH_RETURN');
    expect(finalized.stage).toBe('finalized-success');
    expect(finalized.appealWindow).toBe('closed-finalized');
    expect(isTerminalLifecycleStage(finalized.stage)).toBe(true);

    const finalizedErr = mapGenLayerStatusToLifecycle('FINALIZED', 'FINISHED_WITH_ERROR');
    expect(finalizedErr.stage).toBe('finalized-error');
    expect(isTerminalLifecycleStage(finalizedErr.stage)).toBe(true);
  });
});

describe('normalizeProofBundle', () => {
  it('identifies placeholder proof cleanly', () => {
    const norm = normalizeProofBundle({ _placeholder: true, contract_address: '', cases: [] });
    expect(norm.isPlaceholder).toBe(true);
    expect(norm.chainId).toBe(61999);
  });
});
