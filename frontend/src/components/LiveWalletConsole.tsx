import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  ExternalLink,
  Gavel,
  RefreshCw,
  Send,
  Wallet,
} from 'lucide-react';
import type { LiveReadSnapshot, NormalizedProofBundle } from '../types/scriptAlibi';
import { buildExplorerAddressUrl, STUDIONET_CHAIN_ID } from '../lib/proofAdapter';
import { truncateMiddle, validateImmutableEvidenceUrl } from '../lib/validation';
import { VerdictBadge } from './VerdictBadge';

export function formatWeiToGen(weiStr?: string | number | null): string {
  if (weiStr === undefined || weiStr === null || weiStr === '') return '0 GEN';
  try {
    const wei = BigInt(String(weiStr));
    if (wei === 0n) return '0 GEN';
    const whole = wei / 10n ** 18n;
    const rem = wei % 10n ** 18n;
    if (rem === 0n) return `${whole.toString()} GEN`;
    const frac = rem.toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
    return `${whole.toString()}.${frac || '0'} GEN`;
  } catch {
    return `${String(weiStr)} wei`;
  }
}

export function parseGenToWei(genInput: string): bigint {
  const cleaned = genInput.trim();
  if (!cleaned || cleaned === '0') return 0n;
  if (!/^\d+(\.\d{1,18})?$/.test(cleaned)) {
    throw new Error('Enter a valid non-negative GEN amount (up to 18 decimals).');
  }
  const [wholePart, fracPart = ''] = cleaned.split('.');
  const fracPadded = fracPart.padEnd(18, '0').slice(0, 18);
  return BigInt(wholePart) * 10n ** 18n + BigInt(fracPadded);
}

export interface WalletSubmitHandlers {
  onConnectWallet: () => Promise<void>;
  onSwitchToStudioNet: () => Promise<void>;
  onRefreshLive: () => Promise<void>;
  onCreatePool: (params: {
    workTitle: string;
    elementClause: string;
    deadlineTs: number;
    valueWei: bigint;
  }) => Promise<void>;
  onSubmitClaim: (params: {
    poolId: number;
    evidenceUrl: string;
    startLine: number;
    endLine: number;
    valueWei: bigint;
  }) => Promise<void>;
  onResolveStuckClaim: (claimId: number) => Promise<void>;
  onSettleExpiredPool: (poolId: number) => Promise<void>;
  onWithdrawRefundable: () => Promise<void>;
}

export function LiveWalletConsole({
  proof,
  effectiveContract,
  contractOverride,
  onContractOverrideChange,
  liveSnapshot,
  walletAddress,
  walletChainId,
  refundableWei,
  isRefreshing,
  busyAction,
  actionNotice,
  actionError,
  handlers,
}: {
  proof: NormalizedProofBundle;
  effectiveContract: string;
  contractOverride: string;
  onContractOverrideChange: (val: string) => void;
  liveSnapshot: LiveReadSnapshot | null;
  walletAddress: string | null;
  walletChainId: number | null;
  refundableWei: string;
  isRefreshing: boolean;
  busyAction: string | null;
  actionNotice: string | null;
  actionError: string | null;
  handlers: WalletSubmitHandlers;
}) {

  // Create Pool form state
  const [workTitle, setWorkTitle] = useState('The Wonderful Wizard of Oz (1900)');
  const [elementClause, setElementClause] = useState(
    "Dorothy's enchanted shoes are explicitly silver shoes rather than ruby slippers."
  );
  const [deadlineOffsetHours, setDeadlineOffsetHours] = useState<number>(24);
  const [bountyGen, setBountyGen] = useState('0.001');

  // Submit Claim form state
  const [claimPoolId, setClaimPoolId] = useState<string>('1');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [startLine, setStartLine] = useState('1');
  const [endLine, setEndLine] = useState('35');
  const [stakeGen, setStakeGen] = useState('0.001');

  const [formError, setFormError] = useState<string | null>(null);

  const urlCheck = evidenceUrl.trim() ? validateImmutableEvidenceUrl(evidenceUrl) : null;
  const isRightNetwork = walletChainId === STUDIONET_CHAIN_ID;
  const hasInjectedProvider = typeof window !== 'undefined' && Boolean((window as unknown as { ethereum?: unknown }).ethereum);

  const handleCreatePoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const valueWei = parseGenToWei(bountyGen);
      const deadlineTs = Math.floor(Date.now() / 1000) + Math.max(1, deadlineOffsetHours) * 3600;
      await handlers.onCreatePool({
        workTitle: workTitle.trim(),
        elementClause: elementClause.trim(),
        deadlineTs,
        valueWei,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const poolId = Number(claimPoolId);
      const sLine = Number(startLine);
      const eLine = Number(endLine);
      if (!Number.isInteger(poolId) || poolId < 0) {
        throw new Error('Pool ID must be a non-negative integer.');
      }
      if (!Number.isInteger(sLine) || !Number.isInteger(eLine) || sLine < 1 || eLine < sLine) {
        throw new Error('Line range must satisfy 1 <= start_line <= end_line.');
      }
      const urlRes = validateImmutableEvidenceUrl(evidenceUrl);
      if (!urlRes.valid) {
        throw new Error(urlRes.reason || 'Evidence URL fails immutable source allowlist.');
      }
      const valueWei = parseGenToWei(stakeGen);
      await handlers.onSubmitClaim({
        poolId,
        evidenceUrl: evidenceUrl.trim(),
        startLine: sLine,
        endLine: eLine,
        valueWei,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const openPools = (liveSnapshot?.pools ?? []).filter(
    (p) => String(p.status).toUpperCase() === 'OPEN'
  );

  return (
    <section className="space-y-6">
      {/* Wallet & Network Bar */}
      <div className="rounded-sm border border-[#141518] bg-[#FDFBF7] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 font-ledger-mono text-[11px] uppercase tracking-widest text-[#8C6D2E]">
              <Wallet className="h-3.5 w-3.5" />
              GenLayer StudioNet Interactive Desk (Chain ID {STUDIONET_CHAIN_ID})
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-[#141518]">
              Live Contract Ledger &amp; Wallet Settlement Flows
            </h2>
            <p className="mt-1 text-xs text-[#57544D]">
              Target Contract:{' '}
              {effectiveContract ? (
                <a
                  href={buildExplorerAddressUrl(effectiveContract, proof.explorerBaseUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-ledger-mono text-[#1F4E78] hover:underline"
                >
                  {effectiveContract}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="font-ledger-mono text-[#9C6615]">
                  Not yet bundled — paste contract address or await deploy/proof.json
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlers.onRefreshLive()}
              disabled={isRefreshing || !effectiveContract}
              className="inline-flex items-center gap-1.5 rounded-sm border border-[#CFC7B5] bg-white px-3 py-2 text-xs font-medium text-[#141518] hover:bg-[#FAF7F0] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh State
            </button>

            {!walletAddress ? (
              <button
                type="button"
                onClick={() => void handlers.onConnectWallet()}
                className="inline-flex items-center gap-1.5 rounded-sm border border-[#141518] bg-[#141518] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#FDFBF7] hover:bg-[#2B2D33] cursor-pointer"
              >
                <Wallet className="h-3.5 w-3.5" />
                Connect MetaMask / Wallet
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-sm border border-[#1B5E3F] bg-[#E8F3EC] px-2.5 py-1.5 font-ledger-mono text-xs text-[#14472F]">
                  {truncateMiddle(walletAddress, 8, 6)}
                </span>
                {!isRightNetwork && (
                  <button
                    type="button"
                    onClick={() => void handlers.onSwitchToStudioNet()}
                    className="rounded-sm border border-[#9C6615] bg-[#FDF3DF] px-3 py-1.5 text-xs font-semibold text-[#754B0C] hover:bg-[#F9E7C2] cursor-pointer"
                  >
                    Switch / Add StudioNet (61999)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {!hasInjectedProvider && (
          <div className="rounded-sm border border-[#D9A74A] bg-[#FDF3DF] p-3 text-xs text-[#754B0C]">
            No injected browser wallet (<code>window.ethereum</code>) detected in this browser.
            Install MetaMask to submit write transactions on Chain ID 61999, or browse all live
            pools and claims below in read-only mode.
          </div>
        )}

        {/* Refundable Escrow Balance Bar */}
        {walletAddress && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#DED7C8] bg-[#FAF7F0] px-4 py-3">
            <div className="flex items-center gap-2.5 text-xs">
              <Coins className="h-4 w-4 text-[#8C6D2E]" />
              <div>
                <span className="text-[#57544D] uppercase tracking-wider text-[10px] font-semibold block">
                  Your Refundable Escrow Balance (Pull-Payment)
                </span>
                <span className="font-ledger-mono text-sm font-semibold text-[#141518]">
                  {formatWeiToGen(refundableWei)}{' '}
                  <span className="text-[11px] font-normal text-[#57544D]">
                    ({refundableWei} wei)
                  </span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handlers.onWithdrawRefundable()}
              disabled={busyAction !== null || BigInt(refundableWei || '0') === 0n}
              className="rounded-sm border border-[#141518] bg-[#141518] px-3.5 py-1.5 text-xs font-semibold text-[#FDFBF7] hover:bg-[#2B2D33] disabled:opacity-40 cursor-pointer"
            >
              {busyAction === 'withdraw_refundable'
                ? 'Withdrawing...'
                : 'Withdraw Refundable Balance'}
            </button>
          </div>
        )}

        {/* Optional contract address override for custom testing */}
        {proof.isPlaceholder && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E6E0D3] text-xs">
            <label className="font-ledger-mono text-[11px] text-[#57544D]">
              Contract Override:
            </label>
            <input
              type="text"
              value={contractOverride}
              onChange={(e) => onContractOverrideChange(e.target.value)}
              placeholder="0x... StudioNet ScriptAlibi address"
              className="flex-1 min-w-[260px] rounded-sm border border-[#CFC7B5] bg-white px-2.5 py-1 font-ledger-mono text-xs"
            />
          </div>
        )}

        {(actionNotice || actionError || formError) && (
          <div className="space-y-2">
            {actionNotice && (
              <div className="flex items-center gap-2 rounded-sm border border-[#B9DEC7] bg-[#E8F3EC] px-3 py-2 text-xs text-[#14472F]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{actionNotice}</span>
              </div>
            )}
            {(actionError || formError) && (
              <div className="flex items-center gap-2 rounded-sm border border-[#E6B8B8] bg-[#FCEAEA] px-3 py-2 text-xs text-[#7A181B]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError || actionError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Write Action Forms: Create Pool + Submit Alibi Claim */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Form 1: Create Clearance Pool */}
        <form
          onSubmit={(e) => void handleCreatePoolSubmit(e)}
          className="rounded-sm border border-[#CFC7B5] bg-[#FDFBF7] p-5 space-y-3.5"
        >
          <div className="border-b border-[#E6E0D3] pb-2.5">
            <div className="font-ledger-mono text-[10px] uppercase tracking-widest text-[#8C6D2E]">
              create_clearance_pool · Payable
            </div>
            <h3 className="text-lg font-semibold text-[#141518]">
              1. Create Literary Clearance Pool
            </h3>
            <p className="text-xs text-[#57544D] mt-0.5">
              Validators judge whether the clause is <code>CLEARABLE</code> or{' '}
              <code>TOO_VAGUE</code>. Vague clauses credit your deposit safely to{' '}
              <code>refundable_balances</code>.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
              Public-Domain Work Title
            </label>
            <input
              type="text"
              required
              value={workTitle}
              onChange={(e) => setWorkTitle(e.target.value)}
              className="w-full rounded-sm border border-[#CFC7B5] bg-white px-3 py-2 text-xs text-[#141518] focus:border-[#141518] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
              Observable Element Clause
            </label>
            <textarea
              rows={3}
              required
              value={elementClause}
              onChange={(e) => setElementClause(e.target.value)}
              className="w-full rounded-sm border border-[#CFC7B5] bg-white px-3 py-2 text-xs text-[#141518] focus:border-[#141518] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
                Deadline Window
              </label>
              <select
                value={deadlineOffsetHours}
                onChange={(e) => setDeadlineOffsetHours(Number(e.target.value))}
                className="w-full rounded-sm border border-[#CFC7B5] bg-white px-2.5 py-2 text-xs text-[#141518]"
              >
                <option value={1}>+1 Hour</option>
                <option value={24}>+24 Hours</option>
                <option value={72}>+3 Days</option>
                <option value={168}>+7 Days</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
                Bounty Deposit (GEN)
              </label>
              <input
                type="text"
                value={bountyGen}
                onChange={(e) => setBountyGen(e.target.value)}
                className="w-full rounded-sm border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!walletAddress || !effectiveContract || busyAction !== null}
            className="w-full inline-flex items-center justify-center gap-2 rounded-sm border border-[#141518] bg-[#141518] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#FDFBF7] hover:bg-[#2B2D33] disabled:opacity-40 cursor-pointer"
          >
            <Gavel className="h-3.5 w-3.5" />
            {busyAction === 'create_clearance_pool'
              ? 'Submitting Pool to StudioNet...'
              : 'Submit Clearance Pool'}
          </button>
        </form>

        {/* Form 2: Submit Alibi Claim */}
        <form
          onSubmit={(e) => void handleClaimSubmit(e)}
          className="rounded-sm border border-[#CFC7B5] bg-[#FDFBF7] p-5 space-y-3.5"
        >
          <div className="border-b border-[#E6E0D3] pb-2.5">
            <div className="font-ledger-mono text-[10px] uppercase tracking-widest text-[#8C6D2E]">
              submit_alibi_claim · Payable
            </div>
            <h3 className="text-lg font-semibold text-[#141518]">
              2. Submit Plot-Alibi Evidence Claim
            </h3>
            <p className="text-xs text-[#57544D] mt-0.5">
              Commit-pinned immutable URLs only. Validators re-fetch, verify{' '}
              <code>snippet_sha256</code> and verbatim quote in Python, and vote on verdict.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
                Pool ID
              </label>
              <input
                type="number"
                min={0}
                value={claimPoolId}
                onChange={(e) => setClaimPoolId(e.target.value)}
                className="w-full rounded-sm border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
                Start Line
              </label>
              <input
                type="number"
                min={1}
                value={startLine}
                onChange={(e) => setStartLine(e.target.value)}
                className="w-full rounded-sm border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
                End Line
              </label>
              <input
                type="number"
                min={1}
                value={endLine}
                onChange={(e) => setEndLine(e.target.value)}
                className="w-full rounded-sm border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
              />
            </div>
          </div>

          {openPools.length > 0 && (
            <div className="text-[11px] text-[#57544D]">
              Quick select open pool:{' '}
              <span className="inline-flex flex-wrap gap-1.5 ml-1">
                {openPools.map((p) => (
                  <button
                    key={p.pool_id}
                    type="button"
                    onClick={() => setClaimPoolId(String(p.pool_id))}
                    className="rounded-sm border border-[#CFC7B5] bg-white px-2 py-0.5 font-ledger-mono text-[10px] hover:bg-[#EFEAE0] cursor-pointer"
                  >
                    #{(p.pool_id)} ({(p.work_title || 'Pool').slice(0, 18)})
                  </button>
                ))}
              </span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
              Commit-Pinned Immutable Source URL
            </label>
            <input
              type="url"
              required
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://raw.githubusercontent.com/<owner>/<repo>/<40-hex-sha>/<path>"
              className="w-full rounded-sm border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
            />
            {urlCheck && (
              <p
                className={`mt-1 text-[11px] ${
                  urlCheck.valid ? 'text-[#1B5E3F]' : 'text-[#9B2226]'
                }`}
              >
                {urlCheck.valid
                  ? `Valid immutable source (${urlCheck.sourceType})`
                  : urlCheck.reason}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
              Claimant Stake (GEN)
            </label>
            <input
              type="text"
              value={stakeGen}
              onChange={(e) => setStakeGen(e.target.value)}
              className="w-full rounded-sm border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
            />
          </div>

          <button
            type="submit"
            disabled={!walletAddress || !effectiveContract || busyAction !== null}
            className="w-full inline-flex items-center justify-center gap-2 rounded-sm border border-[#141518] bg-[#141518] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#FDFBF7] hover:bg-[#2B2D33] disabled:opacity-40 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            {busyAction === 'submit_alibi_claim'
              ? 'Submitting Alibi Claim...'
              : 'Submit Alibi Claim'}
          </button>
        </form>
      </div>

      {/* Live Contract Ledger Tables */}
      <div className="rounded-sm border border-[#CFC7B5] bg-[#FDFBF7] p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DED7C8] pb-3">
          <div>
            <h3 className="text-xl font-semibold text-[#141518]">
              Live On-Chain Pools &amp; Claims Ledger
            </h3>
            <p className="text-xs text-[#57544D]">
              Direct view-call snapshot from StudioNet (`get_all_pools`, `get_all_claims`,
              `get_protocol_stats`).
            </p>
          </div>
          {liveSnapshot?.stats && (
            <div className="flex flex-wrap gap-2 font-ledger-mono text-[11px]">
              <span className="rounded-sm border border-[#DED7C8] bg-[#FAF7F0] px-2.5 py-1">
                Pools: {liveSnapshot.stats.total_pools ?? liveSnapshot.pools.length}
              </span>
              <span className="rounded-sm border border-[#DED7C8] bg-[#FAF7F0] px-2.5 py-1">
                Claims: {liveSnapshot.stats.total_claims ?? liveSnapshot.claims.length}
              </span>
              <span className="rounded-sm border border-[#DED7C8] bg-[#FAF7F0] px-2.5 py-1">
                Vague Rejects: {liveSnapshot.stats.total_vague_rejections ?? 0}
              </span>
            </div>
          )}
        </div>

        {/* Pools List */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#57544D] mb-2">
            Clearance Pools ({liveSnapshot?.pools.length ?? 0})
          </h4>
          {!liveSnapshot || liveSnapshot.pools.length === 0 ? (
            <p className="text-xs text-[#78736A] italic">
              No live pools fetched yet. Click &ldquo;Refresh State&rdquo; to query StudioNet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {liveSnapshot.pools.map((pool) => (
                <div
                  key={pool.pool_id}
                  className="rounded-sm border border-[#DED7C8] bg-white p-3.5 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2 font-ledger-mono text-xs">
                      <span className="font-semibold text-[#141518]">Pool #{pool.pool_id}</span>
                      <span className="rounded-sm bg-[#EFEAE0] px-2 py-0.5 text-[10px]">
                        {pool.status}
                      </span>
                      <span className="text-[#8C6D2E]">{formatWeiToGen(pool.bounty_wei)}</span>
                    </div>
                    <div className="text-sm font-semibold text-[#141518]">{pool.work_title}</div>
                    <div className="font-editorial italic text-xs text-[#57544D]">
                      &ldquo;{pool.element_clause}&rdquo;
                    </div>
                    <div className="font-ledger-mono text-[10px] text-[#78736A]">
                      clause_sha256: {truncateMiddle(pool.clause_sha256, 12, 10)} · deadline:{' '}
                      {pool.deadline_ts ? new Date(pool.deadline_ts * 1000).toLocaleString() : '—'}
                    </div>
                  </div>

                  {String(pool.status).toUpperCase() === 'OPEN' && walletAddress && (
                    <button
                      type="button"
                      onClick={() => void handlers.onSettleExpiredPool(pool.pool_id)}
                      disabled={busyAction !== null}
                      className="rounded-sm border border-[#CFC7B5] bg-[#FAF7F0] px-3 py-1.5 text-[11px] font-semibold text-[#141518] hover:bg-[#EFEAE0] disabled:opacity-50 cursor-pointer"
                    >
                      Settle Expired Pool
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Claims List */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#57544D] mb-2">
            Alibi Claims ({liveSnapshot?.claims.length ?? 0})
          </h4>
          {!liveSnapshot || liveSnapshot.claims.length === 0 ? (
            <p className="text-xs text-[#78736A] italic">No live claims fetched yet.</p>
          ) : (
            <div className="space-y-2.5">
              {liveSnapshot.claims.map((claim) => (
                <div
                  key={claim.claim_id}
                  className="rounded-sm border border-[#DED7C8] bg-white p-3.5 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2 font-ledger-mono text-xs">
                      <span className="font-semibold text-[#141518]">
                        Claim #{claim.claim_id} (Pool #{claim.pool_id})
                      </span>
                      <VerdictBadge outcome={claim.verdict} rawVerdict={claim.verdict} />
                      <span className="rounded-sm bg-[#EFEAE0] px-2 py-0.5 text-[10px]">
                        {claim.status}
                      </span>
                    </div>
                    {claim.evidence_quote && (
                      <div className="font-editorial italic text-xs text-[#141518]">
                        &ldquo;{claim.evidence_quote}&rdquo;
                      </div>
                    )}
                    {claim.rationale && (
                      <div className="text-xs text-[#57544D]">{claim.rationale}</div>
                    )}
                    <div className="font-ledger-mono text-[10px] text-[#78736A]">
                      snippet_sha256: {truncateMiddle(claim.snippet_sha256, 12, 10)} · lines{' '}
                      {claim.start_line}–{claim.end_line} · stake {formatWeiToGen(claim.stake_wei)}
                    </div>
                  </div>

                  {walletAddress &&
                    (String(claim.status).toUpperCase().includes('PENDING') ||
                      String(claim.status).toUpperCase().includes('STUCK')) && (
                      <button
                        type="button"
                        onClick={() => void handlers.onResolveStuckClaim(claim.claim_id)}
                        disabled={busyAction !== null}
                        className="rounded-sm border border-[#CFC7B5] bg-[#FAF7F0] px-3 py-1.5 text-[11px] font-semibold text-[#141518] hover:bg-[#EFEAE0] disabled:opacity-50 cursor-pointer"
                      >
                        Resolve Stuck Claim
                      </button>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
