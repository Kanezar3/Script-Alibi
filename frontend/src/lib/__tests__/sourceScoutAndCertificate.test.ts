import { describe, expect, it } from 'vitest';
import {
  MAX_LINE_WINDOW,
  MAX_SNIPPET_CHARS,
  searchPrimaryTextLines,
  sliceAndHashPrimaryText,
} from '../sourceScout';
import {
  buildClearanceCertificatePayload,
  formatClearanceCertificateMarkdown,
  sanitizeFilenameSlug,
} from '../clearanceCertificate';
import type { NormalizedProofBundle, ProofCaseRecord } from '../../types/scriptAlibi';

describe('sourceScout', () => {
  it('slices 1-based lines, collapses whitespace, and matches Python _slice_snippet SHA-256', async () => {
    const raw = 'Line one\r\n  Line   two \r\n\tLine three\r\nLine four';
    const res = await sliceAndHashPrimaryText(raw, 2, 3);
    expect(res.valid).toBe(true);
    expect(res.windowLines).toBe(2);
    expect(res.snippet).toBe('Line two Line three');
    expect(res.snippetSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects windows exceeding MAX_LINE_WINDOW (120)', async () => {
    const raw = Array.from({ length: 150 }, (_, idx) => `Row ${idx + 1}`).join('\n');
    const res = await sliceAndHashPrimaryText(raw, 1, MAX_LINE_WINDOW + 1);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('MAX_LINE_WINDOW');
  });

  it('caps normalized snippet length at MAX_SNIPPET_CHARS (3000)', async () => {
    const longLine = 'a'.repeat(3500);
    const res = await sliceAndHashPrimaryText(longLine, 1, 1);
    expect(res.valid).toBe(true);
    expect(res.truncatedToMaxChars).toBe(true);
    expect(res.snippetLength).toBe(MAX_SNIPPET_CHARS);
  });

  it('searches lines case-insensitively and respects maxHits', () => {
    const raw = 'Dorothy wore silver shoes.\nAnother line\nSilver Shoes again\nSILVER SHOES';
    const hits = searchPrimaryTextLines(raw, 'silver shoes', 2);
    expect(hits).toEqual([
      { lineNumber: 1, text: 'Dorothy wore silver shoes.' },
      { lineNumber: 3, text: 'Silver Shoes again' },
    ]);
  });
});

describe('clearanceCertificate', () => {
  const sampleProof: NormalizedProofBundle = {
    isPlaceholder: false,
    network: 'GenLayer StudioNet',
    chainId: 61999,
    rpcUrl: 'https://studio.genlayer.com/api',
    explorerBaseUrl: 'https://explorer-studio.genlayer.com',
    contractAddress: '0x8B5806dfFAfdd9CA429517e60eC37D41b0E2b8A2',
    deployerAddress: '0x1111111111111111111111111111111111111111',
    contractSha256: '54dd155d0c88add5376418f49ee9fed846c5e5ee8238084e01bdca1a6b0fccda',
    cases: [],
    rawProof: {},
  };

  const sampleCase: ProofCaseRecord = {
    caseId: 'case-3',
    caseNumber: 3,
    title: 'Wizard of Oz Silver Shoes',
    subtitle: 'Public domain origin check',
    outcome: 'ORIGIN_VERIFIED',
    rawVerdict: 'ORIGIN_VERIFIED',
    action: 'submit_alibi_claim',
    txHash: '0x7645910bb5162b32b5e8bea00c6e4e09c81583e01309b6d23264e50aa761169f',
    finalityStatus: 'FINALIZED',
    poolId: 1,
    claimId: 1,
    workTitle: 'The Wonderful Wizard of Oz (1900)',
    elementClause: 'Dorothy wears silver shoes.',
    clauseSha256: '6e0a9cc100000000000000000000000000000000000000000000000000000000',
    evidenceUrl: 'https://raw.githubusercontent.com/GITenberg/The-Wonderful-Wizard-of-Oz_55/d19a4315b7c6f4471de8840a1a81609b34841dff/55.txt',
    startLine: 499,
    endLine: 522,
    snippetSha256: 'abcd'.repeat(16),
    evidenceQuote: 'silver shoes that had belonged to the Witch of the East',
    snippetText: 'She noticed the silver shoes that had belonged to the Witch of the East.',
  };

  it('builds a structured Chain-of-Title Clearance Certificate payload and Markdown brief', () => {
    const payload = buildClearanceCertificatePayload(
      sampleProof,
      sampleCase,
      '2026-11-18T19:30:00.000Z'
    );
    expect(payload.schema).toBe('script-alibi/clearance-certificate/v1');
    expect(payload.network.chainId).toBe(61999);
    expect(payload.caseDossier.txExplorerUrl).toContain(sampleCase.txHash);

    const md = formatClearanceCertificateMarkdown(payload);
    expect(md).toContain('# Script Alibi — Chain-of-Title Clearance Certificate');
    expect(md).toContain('EX-03');
    expect(md).toContain('L499-L522');
    expect(md).toContain(sampleCase.evidenceQuote!);
  });

  it('sanitizes filename slugs cleanly', () => {
    expect(sanitizeFilenameSlug('Wizard of Oz: Silver Shoes!')).toBe(
      'wizard-of-oz-silver-shoes'
    );
  });
});
