import { describe, expect, it } from 'vitest';
import realProofJson from '../../data/proof.json';
import { formatWeiToGen, parseGenToWei } from '../../components/LiveWalletConsole';
import { unwrapViewResult } from '../genlayerClient';
import {
  buildExplorerAddressUrl,
  buildExplorerTxUrl,
  normalizeProofBundle,
} from '../proofAdapter';
import { splitSnippetAroundQuote } from '../validation';

describe('formatWeiToGen & parseGenToWei', () => {
  it('converts GEN decimals to wei and back cleanly', () => {
    const wei = parseGenToWei('0.001');
    expect(wei).toBe(1000000000000000n);
    expect(formatWeiToGen(wei.toString())).toBe('0.001 GEN');

    expect(parseGenToWei('0')).toBe(0n);
    expect(formatWeiToGen('0')).toBe('0 GEN');
    expect(formatWeiToGen('2000000000000000000')).toBe('2 GEN');
  });

  it('rejects malformed GEN amounts', () => {
    expect(() => parseGenToWei('-1')).toThrow();
    expect(() => parseGenToWei('abc')).toThrow();
  });
});

describe('unwrapViewResult', () => {
  it('parses JSON strings from contract view calls', () => {
    expect(unwrapViewResult('[{"pool_id":1}]')).toEqual([{ pool_id: 1 }]);
    expect(unwrapViewResult({ total_pools: 3 })).toEqual({ total_pools: 3 });
  });
});

describe('normalizeProofBundle', () => {
  it('normalizes recorded StudioNet cases and builds explorer URLs', () => {
    const bundle = normalizeProofBundle({
      network: 'GenLayer StudioNet',
      chain_id: 61999,
      contract_address: '0x1111111111111111111111111111111111111111',
      deployer: '0x2222222222222222222222222222222222222222',
      cases: [
        {
          case_id: 'case-3',
          outcome: 'ORIGIN_VERIFIED',
          tx_hash: `0x${'a'.repeat(64)}`,
          pool_id: 1,
          claim_id: 1,
          evidence_quote: 'Silver Shoes',
          snippet_sha256: 'b'.repeat(64),
        },
      ],
    });

    expect(bundle.isPlaceholder).toBe(false);
    expect(bundle.cases).toHaveLength(1);
    expect(bundle.cases[0].outcome).toBe('ORIGIN_VERIFIED');
    expect(bundle.cases[0].explorerTxUrl).toBe(
      buildExplorerTxUrl(`0x${'a'.repeat(64)}`)
    );
    expect(buildExplorerAddressUrl(bundle.contractAddress)).toBe(
      'https://explorer-studio.genlayer.com/address/0x1111111111111111111111111111111111111111'
    );
  });

  it('normalizes the bundled StudioNet deploy/proof.json with all 6 cases and verbatim quotes', () => {
    const bundle = normalizeProofBundle(realProofJson);
    expect(bundle.isPlaceholder).toBe(false);
    expect(bundle.contractAddress).toBe('0x8B5806dfFAfdd9CA429517e60eC37D41b0E2b8A2');
    expect(bundle.cases).toHaveLength(6);

    const case3 = bundle.cases.find((c) => c.outcome === 'ORIGIN_VERIFIED');
    expect(case3?.snippetText).toBeTruthy();
    expect(case3?.evidenceQuote).toBeTruthy();
    expect(splitSnippetAroundQuote(case3!.snippetText!, case3!.evidenceQuote!).found).toBe(true);

    const case4 = bundle.cases.find((c) => c.outcome === 'CONTRADICTED_BY_SOURCE');
    expect(case4?.snippetText).toBeTruthy();
    expect(case4?.evidenceQuote).toBeTruthy();
    expect(splitSnippetAroundQuote(case4!.snippetText!, case4!.evidenceQuote!).found).toBe(true);
  });
});
