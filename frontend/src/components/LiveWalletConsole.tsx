import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  Gavel,
  RefreshCw,
  Send,
  Wallet,
} from 'lucide-react';
import type { LiveReadSnapshot, NormalizedProofBundle } from '../types/scriptAlibi';
import { STUDIONET_CHAIN_ID } from '../lib/proofAdapter';
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

interface PoolPreset {
  id: string;
  title: string;
  tag: string;
  workTitle: string;
  elementClause: string;
  bountyGen: string;
}

interface ClaimPreset {
  id: string;
  title: string;
  tag: string;
  poolId: string;
  evidenceUrl: string;
  startLine: string;
  endLine: string;
  stakeGen: string;
}

const POOL_PRESETS: PoolPreset[] = [
  {
    id: 'oz-silver-shoes',
    title: 'Wizard of Oz',
    tag: 'CLEARABLE',
    workTitle: 'The Wonderful Wizard of Oz (1900)',
    elementClause:
      "In L. Frank Baum's 1900 passage, Dorothy's enchanted shoes are described as silver shoes.",
    bountyGen: '0.001',
  },
  {
    id: 'dracula-sunlight-myth',
    title: 'Dracula (Sunlight)',
    tag: 'CLEARABLE',
    workTitle: 'Dracula (1897)',
    elementClause:
      'Dracula is destroyed solely by direct sunlight turning him to ash.',
    bountyGen: '0.001',
  },
  {
    id: 'vague-atmosphere',
    title: 'Vague Atmosphere',
    tag: 'TOO_VAGUE',
    workTitle: 'Dracula (1897)',
    elementClause: 'Authentic Victorian gothic vibe and eerie atmospheric mood',
    bountyGen: '0.001',
  },
];

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
  const claimPresets = useMemo<ClaimPreset[]>(() => {
    const ozCase = proof.cases.find((c) => c.outcome === 'ORIGIN_VERIFIED');
    const draculaCase = proof.cases.find((c) => c.outcome === 'CONTRADICTED_BY_SOURCE');
    const insuffCase = proof.cases.find((c) => c.outcome === 'INSUFFICIENT_EVIDENCE');

    return [
      {
        id: 'oz-verified',
        title: `Oz L${ozCase?.startLine ?? 499}–${ozCase?.endLine ?? 522}`,
        tag: 'ORIGIN_VERIFIED',
        poolId: String(ozCase?.poolId ?? 3),
        evidenceUrl:
          ozCase?.evidenceUrl ||
          'https://raw.githubusercontent.com/GITenberg/The-Wonderful-Wizard-of-Oz_55/d19a4315b7c6f4471de8840a1a81609b34841dff/55.txt',
        startLine: String(ozCase?.startLine ?? 499),
        endLine: String(ozCase?.endLine ?? 522),
        stakeGen: '0.0002',
      },
      {
        id: 'dracula-contradicted',
        title: `Dracula L${draculaCase?.startLine ?? 15417}–${draculaCase?.endLine ?? 15445}`,
        tag: 'CONTRADICTED',
        poolId: String(draculaCase?.poolId ?? 2),
        evidenceUrl:
          draculaCase?.evidenceUrl ||
          'https://raw.githubusercontent.com/cpwardell/dracula/0fd55e1ae21742ce3e28e26d78ebc46717642663/pg345.txt',
        startLine: String(draculaCase?.startLine ?? 15417),
        endLine: String(draculaCase?.endLine ?? 15445),
        stakeGen: '0.0002',
      },
      {
        id: 'oz-toc-insufficient',
        title: `Oz TOC L${insuffCase?.startLine ?? 44}–${insuffCase?.endLine ?? 71}`,
        tag: 'INSUFFICIENT',
        poolId: String(insuffCase?.poolId ?? 3),
        evidenceUrl:
          insuffCase?.evidenceUrl ||
          'https://raw.githubusercontent.com/GITenberg/The-Wonderful-Wizard-of-Oz_55/d19a4315b7c6f4471de8840a1a81609b34841dff/55.txt',
        startLine: String(insuffCase?.startLine ?? 44),
        endLine: String(insuffCase?.endLine ?? 71),
        stakeGen: '0.0002',
      },
    ];
  }, [proof.cases]);

  // Create Pool form state
  const [workTitle, setWorkTitle] = useState(POOL_PRESETS[0].workTitle);
  const [elementClause, setElementClause] = useState(POOL_PRESETS[0].elementClause);
  const [deadlineOffsetHours, setDeadlineOffsetHours] = useState<number>(24);
  const [bountyGen, setBountyGen] = useState(POOL_PRESETS[0].bountyGen);

  // Submit Claim form state
  const [claimPoolId, setClaimPoolId] = useState<string>(claimPresets[0]?.poolId ?? '3');
  const [evidenceUrl, setEvidenceUrl] = useState(claimPresets[0]?.evidenceUrl ?? '');
  const [startLine, setStartLine] = useState(claimPresets[0]?.startLine ?? '499');
  const [endLine, setEndLine] = useState(claimPresets[0]?.endLine ?? '522');
  const [stakeGen, setStakeGen] = useState(claimPresets[0]?.stakeGen ?? '0.0002');

  const [formError, setFormError] = useState<string | null>(null);

  const urlCheck = evidenceUrl.trim() ? validateImmutableEvidenceUrl(evidenceUrl) : null;
  const isRightNetwork = walletChainId === STUDIONET_CHAIN_ID;
  const hasInjectedProvider =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { ethereum?: unknown }).ethereum);

  const applyPoolPreset = (preset: PoolPreset) => {
    setWorkTitle(preset.workTitle);
    setElementClause(preset.elementClause);
    setBountyGen(preset.bountyGen);
    setFormError(null);
  };

  const applyClaimPreset = (preset: ClaimPreset) => {
    setClaimPoolId(preset.poolId);
    setEvidenceUrl(preset.evidenceUrl);
    setStartLine(preset.startLine);
    setEndLine(preset.endLine);
    setStakeGen(preset.stakeGen);
    setFormError(null);
  };

  const handleCreatePoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const valueWei = parseGenToWei(bountyGen);
      const deadlineTs =
        Math.floor(Date.now() / 1000) + Math.max(1, deadlineOffsetHours) * 3600;
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
      if (
        !Number.isInteger(sLine) ||
        !Number.isInteger(eLine) ||
        sLine < 1 ||
        eLine < sLine
      ) {
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
    <section className="space-y-5">
      {/* Streamlined Desk Bar: Wallet Connection · Chain 61999 · Pull-Payment Escrow Balance */}
      <div className="rounded-[2px] border border-[#141518] bg-[#FDFBF7] px-4 py-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-ledger-mono text-[10px] font-semibold uppercase tracking-widest text-[#8C6D2E]">
              <Wallet className="h-3.5 w-3.5" />
              Wallet Desk · Chain {STUDIONET_CHAIN_ID}
            </span>

            {walletAddress ? (
              <span className="inline-flex items-center gap-2 font-ledger-mono text-[11px]">
                <span className="rounded-[2px] border border-[#1B5E3F] bg-[#E8F3EC] px-2 py-0.5 text-[#14472F] font-semibold">
                  {truncateMiddle(walletAddress, 8, 6)}
                </span>
                <span className="inline-flex items-center gap-1 text-[#57544D]">
                  <Coins className="h-3 w-3 text-[#8C6D2E]" />
                  Escrow:{' '}
                  <strong className="text-[#141518]">
                    {formatWeiToGen(refundableWei)}
                  </strong>
                </span>
              </span>
            ) : (
              <span className="font-ledger-mono text-[11px] text-[#57544D]">
                Read-only mode — connect MetaMask for write transactions
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlers.onRefreshLive()}
              disabled={isRefreshing || !effectiveContract}
              className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-1.5 font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#141518] hover:bg-[#FAF7F0] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Syncing...' : 'Refresh State'}
            </button>

            {walletAddress && (
              <button
                type="button"
                onClick={() => void handlers.onWithdrawRefundable()}
                disabled={busyAction !== null || BigInt(refundableWei || '0') === 0n}
                className="rounded-[2px] border border-[#141518] bg-[#FAF7F0] px-3 py-1.5 font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#141518] hover:bg-[#EFEAE0] disabled:opacity-40 cursor-pointer"
              >
                {busyAction === 'withdraw_refundable'
                  ? 'Withdrawing...'
                  : 'Withdraw Escrow'}
              </button>
            )}

            {!walletAddress ? (
              <button
                type="button"
                onClick={() => void handlers.onConnectWallet()}
                className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#111215] bg-[#111215] px-3.5 py-1.5 font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#F6F2EA] hover:bg-[#2B2D33] cursor-pointer"
              >
                <Wallet className="h-3 w-3 text-[#C89D42]" />
                Connect Wallet
              </button>
            ) : (
              !isRightNetwork && (
                <button
                  type="button"
                  onClick={() => void handlers.onSwitchToStudioNet()}
                  className="rounded-[2px] border border-[#9C6615] bg-[#FDF3DF] px-2.5 py-1.5 font-ledger-mono text-[10px] font-semibold text-[#754B0C] hover:bg-[#F9E7C2] cursor-pointer"
                >
                  Switch StudioNet (61999)
                </button>
              )
            )}
          </div>
        </div>

        {!hasInjectedProvider && (
          <div className="rounded-[2px] border border-[#D9A74A] bg-[#FDF3DF] px-3 py-2 text-xs text-[#754B0C]">
            No injected browser wallet (<code>window.ethereum</code>) detected. Install MetaMask to
            submit write transactions on Chain ID 61999, or inspect live pools and claims below.
          </div>
        )}

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
              className="flex-1 min-w-[260px] rounded-[2px] border border-[#CFC7B5] bg-white px-2.5 py-1 font-ledger-mono text-xs"
            />
          </div>
        )}

        {(actionNotice || actionError || formError) && (
          <div className="space-y-2">
            {actionNotice && (
              <div className="flex items-center gap-2 rounded-[2px] border border-[#B9DEC7] bg-[#E8F3EC] px-3 py-2 text-xs text-[#14472F]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{actionNotice}</span>
              </div>
            )}
            {(actionError || formError) && (
              <div className="flex items-center gap-2 rounded-[2px] border border-[#E6B8B8] bg-[#FCEAEA] px-3 py-2 text-xs text-[#7A181B]">
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
          className="rounded-[2px] border border-[#141518] bg-[#FDFBF7] p-5 space-y-3.5"
        >
          <div className="border-b border-[#E6E0D3] pb-2.5">
            <div className="font-ledger-mono text-[10px] uppercase tracking-widest text-[#8C6D2E]">
              create_clearance_pool · Payable
            </div>
            <h3 className="text-lg font-semibold text-[#141518]">
              1. Create Literary Clearance Pool
            </h3>
          </div>

          {/* 1-Click Archival Presets: 3-column selector cards */}
          <div className="space-y-1.5">
            <div className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D]">
              1-Click Archival Presets:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {POOL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPoolPreset(preset)}
                  className="flex flex-col justify-between rounded-[2px] border border-[#CFC7B5] bg-[#FAF7F0] px-2.5 py-2 text-left hover:border-[#141518] hover:bg-[#EFEAE0] cursor-pointer"
                >
                  <span className="text-[11px] font-semibold text-[#141518] leading-snug">
                    {preset.title}
                  </span>
                  <span className="mt-1 font-ledger-mono text-[9px] uppercase tracking-wider text-[#8C6D2E]">
                    {preset.tag}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
              Public-Domain Work Title
            </label>
            <input
              type="text"
              required
              value={workTitle}
              onChange={(e) => setWorkTitle(e.target.value)}
              className="w-full rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-2 text-xs text-[#141518] focus:border-[#141518] focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
              Observable Element Clause
            </label>
            <textarea
              rows={3}
              required
              value={elementClause}
              onChange={(e) => setElementClause(e.target.value)}
              className="w-full rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-2 font-editorial text-sm text-[#141518] focus:border-[#141518] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
                Deadline Window
              </label>
              <select
                value={deadlineOffsetHours}
                onChange={(e) => setDeadlineOffsetHours(Number(e.target.value))}
                className="w-full rounded-[2px] border border-[#CFC7B5] bg-white px-2.5 py-2 text-xs text-[#141518]"
              >
                <option value={1}>+1 Hour</option>
                <option value={24}>+24 Hours</option>
                <option value={72}>+3 Days</option>
                <option value={168}>+7 Days</option>
              </select>
            </div>
            <div>
              <label className="block font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
                Bounty Deposit (GEN)
              </label>
              <input
                type="text"
                value={bountyGen}
                onChange={(e) => setBountyGen(e.target.value)}
                className="w-full rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!walletAddress || !effectiveContract || busyAction !== null}
            className="w-full inline-flex items-center justify-center gap-2 rounded-[2px] border border-[#111215] bg-[#111215] px-4 py-2.5 font-ledger-mono text-xs font-semibold uppercase tracking-wider text-[#F6F2EA] hover:bg-[#2B2D33] disabled:opacity-40 cursor-pointer"
          >
            <Gavel className="h-3.5 w-3.5 text-[#C89D42]" />
            {busyAction === 'create_clearance_pool'
              ? 'Submitting Pool to StudioNet...'
              : 'Submit Clearance Pool'}
          </button>
        </form>

        {/* Form 2: Submit Alibi Claim */}
        <form
          onSubmit={(e) => void handleClaimSubmit(e)}
          className="rounded-[2px] border border-[#141518] bg-[#FDFBF7] p-5 space-y-3.5"
        >
          <div className="border-b border-[#E6E0D3] pb-2.5">
            <div className="font-ledger-mono text-[10px] uppercase tracking-widest text-[#8C6D2E]">
              submit_alibi_claim · Payable
            </div>
            <h3 className="text-lg font-semibold text-[#141518]">
              2. Submit Plot-Alibi Evidence Claim
            </h3>
          </div>

          {/* 1-Click Archival Presets: 3-column selector cards */}
          <div className="space-y-1.5">
            <div className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D]">
              1-Click Archival Presets:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {claimPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyClaimPreset(preset)}
                  className="flex flex-col justify-between rounded-[2px] border border-[#CFC7B5] bg-[#FAF7F0] px-2.5 py-2 text-left hover:border-[#141518] hover:bg-[#EFEAE0] cursor-pointer"
                >
                  <span className="text-[11px] font-semibold text-[#141518] leading-snug">
                    {preset.title}
                  </span>
                  <span className="mt-1 font-ledger-mono text-[9px] uppercase tracking-wider text-[#8C6D2E]">
                    {preset.tag}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
                Pool ID
              </label>
              <input
                type="number"
                min={0}
                value={claimPoolId}
                onChange={(e) => setClaimPoolId(e.target.value)}
                className="w-full rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
              />
            </div>
            <div>
              <label className="block font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
                Start Line
              </label>
              <input
                type="number"
                min={1}
                value={startLine}
                onChange={(e) => setStartLine(e.target.value)}
                className="w-full rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
              />
            </div>
            <div>
              <label className="block font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
                End Line
              </label>
              <input
                type="number"
                min={1}
                value={endLine}
                onChange={(e) => setEndLine(e.target.value)}
                className="w-full rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
              />
            </div>
          </div>

          {openPools.length > 0 && (
            <div className="text-[11px] text-[#57544D]">
              Open pools:{' '}
              <span className="inline-flex flex-wrap gap-1.5 ml-1">
                {openPools.map((p) => {
                  const isTargeted = String(p.pool_id) === claimPoolId;
                  return (
                    <button
                      key={p.pool_id}
                      type="button"
                      onClick={() => setClaimPoolId(String(p.pool_id))}
                      className={`rounded-[2px] border px-2 py-0.5 font-ledger-mono text-[10px] cursor-pointer ${
                        isTargeted
                          ? 'border-[#111215] bg-[#111215] text-[#F6F2EA]'
                          : 'border-[#CFC7B5] bg-white text-[#141518] hover:bg-[#EFEAE0]'
                      }`}
                    >
                      #{p.pool_id} ({(p.work_title || 'Pool').slice(0, 18)})
                    </button>
                  );
                })}
              </span>
            </div>
          )}

          <div>
            <label className="block font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
              Commit-Pinned Immutable Source URL
            </label>
            <input
              type="url"
              required
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://raw.githubusercontent.com/<owner>/<repo>/<40-hex-sha>/<path>"
              className="w-full rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
            />
            {urlCheck && (
              <p
                className={`mt-1 font-ledger-mono text-[10px] ${
                  urlCheck.valid ? 'text-[#1B5E3F]' : 'text-[#9B2226]'
                }`}
              >
                {urlCheck.valid
                  ? `✓ Valid immutable source (${urlCheck.sourceType})`
                  : urlCheck.reason}
              </p>
            )}
          </div>

          <div>
            <label className="block font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D] mb-1">
              Claimant Stake (GEN)
            </label>
            <input
              type="text"
              value={stakeGen}
              onChange={(e) => setStakeGen(e.target.value)}
              className="w-full rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518]"
            />
          </div>

          <button
            type="submit"
            disabled={!walletAddress || !effectiveContract || busyAction !== null}
            className="w-full inline-flex items-center justify-center gap-2 rounded-[2px] border border-[#111215] bg-[#111215] px-4 py-2.5 font-ledger-mono text-xs font-semibold uppercase tracking-wider text-[#F6F2EA] hover:bg-[#2B2D33] disabled:opacity-40 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5 text-[#C89D42]" />
            {busyAction === 'submit_alibi_claim'
              ? 'Submitting Alibi Claim...'
              : 'Submit Alibi Claim'}
          </button>
        </form>
      </div>

      {/* Live Contract Ledger Tabular Archival Register */}
      <div className="rounded-[2px] border border-[#141518] bg-[#FDFBF7] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#141518] bg-[#FAF6ED] px-5 py-3">
          <div>
            <h3 className="text-lg font-semibold text-[#141518]">
              Live On-Chain Pools &amp; Claims Register
            </h3>
            <p className="font-ledger-mono text-[10px] text-[#57544D]">
              Click any OPEN pool row to target it in the Claim form · StudioNet view calls
            </p>
          </div>
          {liveSnapshot?.stats && (
            <div className="flex flex-wrap gap-2 font-ledger-mono text-[10px]">
              <span className="rounded-[2px] border border-[#DED7C8] bg-white px-2.5 py-1">
                POOLS: {liveSnapshot.stats.total_pools ?? liveSnapshot.pools.length}
              </span>
              <span className="rounded-[2px] border border-[#DED7C8] bg-white px-2.5 py-1">
                CLAIMS: {liveSnapshot.stats.total_claims ?? liveSnapshot.claims.length}
              </span>
              <span className="rounded-[2px] border border-[#DED7C8] bg-white px-2.5 py-1">
                VAGUE REJECTS: {liveSnapshot.stats.total_vague_rejections ?? 0}
              </span>
            </div>
          )}
        </div>

        {/* Pools Tabular Register */}
        <div className="border-b border-[#DED7C8]">
          <div className="bg-[#FAF7F0] px-5 py-2 border-b border-[#E6E0D3] flex items-center justify-between">
            <h4 className="font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
              Clearance Pools ({liveSnapshot?.pools.length ?? 0})
            </h4>
            {(!liveSnapshot || liveSnapshot.pools.length === 0) && (
              <button
                type="button"
                onClick={() => void handlers.onRefreshLive()}
                disabled={isRefreshing || !effectiveContract}
                className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#141518] bg-white px-2.5 py-1 font-ledger-mono text-[10px] font-semibold text-[#141518] hover:bg-[#EFEAE0] disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Querying StudioNet...' : 'Query StudioNet Now'}
              </button>
            )}
          </div>

          {!liveSnapshot || liveSnapshot.pools.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-[#78736A]">
              {isRefreshing
                ? 'Querying StudioNet view state...'
                : 'No live pools loaded yet. Click "Query StudioNet Now" above.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#DED7C8] bg-[#F6F2EA] font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D]">
                    <th className="py-2 pl-5 pr-3">ID</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Work &amp; Element Clause</th>
                    <th className="py-2 px-3">Bounty</th>
                    <th className="py-2 px-3">Clause SHA</th>
                    <th className="py-2 pl-3 pr-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E0D3]">
                  {liveSnapshot.pools.map((pool) => {
                    const isOpen = String(pool.status).toUpperCase() === 'OPEN';
                    const isSelected = isOpen && String(pool.pool_id) === claimPoolId;

                    return (
                      <tr
                        key={pool.pool_id}
                        onClick={() => {
                          if (isOpen) setClaimPoolId(String(pool.pool_id));
                        }}
                        className={`transition-colors ${
                          isOpen ? 'cursor-pointer' : ''
                        } ${
                          isSelected
                            ? 'bg-[#FAF4E6] border-l-[3px] border-l-[#C89D42]'
                            : isOpen
                              ? 'bg-white hover:bg-[#FAF7F0]'
                              : 'bg-white'
                        }`}
                      >
                        <td className="py-2.5 pl-5 pr-3 font-ledger-mono font-semibold text-[#141518] whitespace-nowrap">
                          #{pool.pool_id}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block rounded-[2px] border px-1.5 py-0.5 font-ledger-mono text-[10px] font-semibold ${
                              isOpen
                                ? 'border-[#1F4E78] bg-[#E9F1F8] text-[#173B5C]'
                                : 'border-[#CFC7B5] bg-[#EFEAE0] text-[#45423C]'
                            }`}
                          >
                            {pool.status}
                          </span>
                          {isSelected && (
                            <span className="ml-1.5 font-ledger-mono text-[9px] font-semibold uppercase text-[#8C6D2E]">
                              TARGET
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 max-w-md">
                          <div className="font-semibold text-[#141518]">{pool.work_title}</div>
                          <div className="font-editorial italic text-[#57544D] line-clamp-2">
                            &ldquo;{pool.element_clause}&rdquo;
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-ledger-mono text-[#8C6D2E] font-medium whitespace-nowrap">
                          {formatWeiToGen(pool.bounty_wei)}
                        </td>
                        <td className="py-2.5 px-3 font-ledger-mono text-[10px] text-[#78736A] whitespace-nowrap">
                          {truncateMiddle(pool.clause_sha256, 8, 6)}
                        </td>
                        <td
                          className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isOpen && walletAddress ? (
                            <button
                              type="button"
                              onClick={() => void handlers.onSettleExpiredPool(pool.pool_id)}
                              disabled={busyAction !== null}
                              className="rounded-[2px] border border-[#CFC7B5] bg-[#FAF7F0] px-2.5 py-1 font-ledger-mono text-[10px] font-semibold text-[#141518] hover:bg-[#EFEAE0] disabled:opacity-50 cursor-pointer"
                            >
                              Settle Expired
                            </button>
                          ) : (
                            <span className="font-ledger-mono text-[10px] text-[#8E897F]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Claims Tabular Register */}
        <div>
          <div className="bg-[#FAF7F0] px-5 py-2 border-b border-[#E6E0D3]">
            <h4 className="font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
              Alibi Claims ({liveSnapshot?.claims.length ?? 0})
            </h4>
          </div>

          {!liveSnapshot || liveSnapshot.claims.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-[#78736A]">
              No live claims fetched yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#DED7C8] bg-[#F6F2EA] font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D]">
                    <th className="py-2 pl-5 pr-3">Claim / Pool</th>
                    <th className="py-2 px-3">Verdict &amp; Status</th>
                    <th className="py-2 px-3">Evidence &amp; Rationale</th>
                    <th className="py-2 px-3">Lines / Stake</th>
                    <th className="py-2 pl-3 pr-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E0D3]">
                  {liveSnapshot.claims.map((claim) => {
                    const isStuck =
                      String(claim.status).toUpperCase().includes('PENDING') ||
                      String(claim.status).toUpperCase().includes('STUCK');

                    return (
                      <tr key={claim.claim_id} className="bg-white">
                        <td className="py-2.5 pl-5 pr-3 font-ledger-mono font-semibold text-[#141518] whitespace-nowrap">
                          #{claim.claim_id}{' '}
                          <span className="font-normal text-[#78736A]">(P#{claim.pool_id})</span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap space-y-1">
                          <div>
                            <VerdictBadge
                              outcome={claim.verdict}
                              rawVerdict={claim.verdict}
                              compact
                            />
                          </div>
                          <div className="font-ledger-mono text-[10px] text-[#57544D]">
                            {claim.status}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 max-w-md space-y-0.5">
                          {claim.evidence_quote && (
                            <div className="font-editorial italic text-[#141518] line-clamp-2">
                              &ldquo;{claim.evidence_quote}&rdquo;
                            </div>
                          )}
                          {claim.rationale && (
                            <div className="text-[11px] text-[#57544D] line-clamp-2">
                              {claim.rationale}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-ledger-mono text-[10px] text-[#57544D] whitespace-nowrap">
                          <div>
                            L{claim.start_line}–{claim.end_line}
                          </div>
                          <div className="text-[#8C6D2E]">{formatWeiToGen(claim.stake_wei)}</div>
                        </td>
                        <td className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">
                          {walletAddress && isStuck ? (
                            <button
                              type="button"
                              onClick={() => void handlers.onResolveStuckClaim(claim.claim_id)}
                              disabled={busyAction !== null}
                              className="rounded-[2px] border border-[#CFC7B5] bg-[#FAF7F0] px-2.5 py-1 font-ledger-mono text-[10px] font-semibold text-[#141518] hover:bg-[#EFEAE0] disabled:opacity-50 cursor-pointer"
                            >
                              Resolve Stuck
                            </button>
                          ) : (
                            <span className="font-ledger-mono text-[10px] text-[#8E897F]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
