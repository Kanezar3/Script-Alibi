import { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSearch,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Link as LinkIcon,
  Hash,
} from 'lucide-react';
import type {
  CaseOutcome,
  LiveReadSnapshot,
  NormalizedProofBundle,
  ProofCaseRecord,
} from '../types/scriptAlibi';
import {
  buildExplorerAddressUrl,
  buildExplorerTxUrl,
} from '../lib/proofAdapter';
import {
  computeSha256Hex,
  splitSnippetAroundQuote,
  truncateMiddle,
  validateImmutableEvidenceUrl,
} from '../lib/validation';
import { mapGenLayerStatusToLifecycle } from '../lib/txTracker';
import { VerdictBadge, LifecycleBadge } from './VerdictBadge';
import { AppealWindowPanel } from './AppealWindowPanel';

function CopyChip({ label, value }: { label: string; value?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <div className="rounded-sm border border-[#E6E0D3] bg-[#FAF7F0] px-2.5 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#78736A]">
          {label}
        </div>
        <div className="font-ledger-mono text-[11px] text-[#8E897F] mt-0.5">—</div>
      </div>
    );
  }

  const handleCopy = () => {
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-sm border border-[#DED7C8] bg-[#FAF7F0] px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
          <Hash className="h-2.5 w-2.5" />
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-[10px] text-[#57544D] hover:text-[#141518] cursor-pointer"
          title={`Copy ${label}`}
        >
          <Copy className="h-2.5 w-2.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div
        className="font-ledger-mono text-[11px] text-[#141518] mt-0.5 break-all"
        title={value}
      >
        {truncateMiddle(value, 14, 12)}
      </div>
    </div>
  );
}

function CaseDossierCard({
  item,
  liveSnapshot,
  explorerBaseUrl,
}: {
  item: ProofCaseRecord;
  liveSnapshot: LiveReadSnapshot | null;
  explorerBaseUrl: string;
}) {
  const [browserShaMatch, setBrowserShaMatch] = useState<'idle' | 'match' | 'mismatch'>('idle');
  const [browserShaValue, setBrowserShaValue] = useState<string>('');

  const liveTx = item.txHash ? liveSnapshot?.txVerifications[item.txHash] : undefined;
  const recordedLifecycle = mapGenLayerStatusToLifecycle(
    item.finalityStatus,
    item.executionResult
  );
  const effectiveLifecycle = liveTx
    ? mapGenLayerStatusToLifecycle(liveTx.statusName, liveTx.executionResultName)
    : recordedLifecycle;

  const urlCheck = item.evidenceUrl ? validateImmutableEvidenceUrl(item.evidenceUrl) : null;
  const quoteSegments =
    item.snippetText && item.evidenceQuote
      ? splitSnippetAroundQuote(item.snippetText, item.evidenceQuote)
      : null;

  const isContradiction =
    item.outcome === 'CONTRADICTED_BY_SOURCE' || item.outcome === 'TOO_VAGUE';

  const handleBrowserShaVerify = async () => {
    if (!item.snippetText || !item.snippetSha256) return;
    const computed = await computeSha256Hex(item.snippetText);
    setBrowserShaValue(computed);
    setBrowserShaMatch(
      computed.toLowerCase() === item.snippetSha256.toLowerCase() ? 'match' : 'mismatch'
    );
  };

  return (
    <article className="rounded-sm border border-[#CFC7B5] bg-[#FDFBF7] shadow-[0_1px_0_rgba(20,21,24,0.06)]">
      {/* Case Header */}
      <div className="border-b border-[#DED7C8] bg-[#FAF6ED] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-ledger-mono uppercase tracking-wider text-[#57544D]">
              <span>Exhibit #{String(item.caseNumber).padStart(2, '0')}</span>
              <span>·</span>
              <span>{item.action}</span>
              {item.poolId !== null && item.poolId !== undefined && (
                <>
                  <span>·</span>
                  <span>Pool #{item.poolId}</span>
                </>
              )}
              {item.claimId !== null && item.claimId !== undefined && (
                <>
                  <span>·</span>
                  <span>Claim #{item.claimId}</span>
                </>
              )}
            </div>
            <h3 className="mt-1 text-xl font-semibold text-[#141518] leading-snug">
              {item.title}
            </h3>
            {item.subtitle && (
              <p className="mt-1 text-sm text-[#57544D] leading-relaxed">{item.subtitle}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <VerdictBadge outcome={item.outcome} rawVerdict={item.rawVerdict} />
            <LifecycleBadge stage={effectiveLifecycle.stage} />
          </div>
        </div>
      </div>

      {/* Recorded vs Live StudioNet Verification Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 border-b border-[#E6E0D3] text-xs">
        <div className="px-5 py-3 border-b md:border-b-0 md:border-r border-[#E6E0D3] bg-[#FDFBF7]">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
            Recorded StudioNet Proof (deploy/proof.json)
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 font-ledger-mono">
            <span className="rounded-sm bg-[#EFEAE0] px-2 py-0.5 text-[11px] font-medium text-[#141518]">
              {item.finalityStatus || 'FINALIZED'}
            </span>
            {item.blockNumber && (
              <span className="text-[#57544D] text-[11px]">Block #{item.blockNumber}</span>
            )}
            {item.txHash && (
              <a
                href={item.explorerTxUrl || buildExplorerTxUrl(item.txHash, explorerBaseUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#1F4E78] hover:underline text-[11px]"
              >
                {truncateMiddle(item.txHash, 10, 8)}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        <div className="px-5 py-3 bg-[#FAF8F3]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
              Live On-Chain StudioNet Read (RPC)
            </span>
            {liveTx ? (
              liveTx.error ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-ledger-mono font-semibold text-[#9B2226]">
                  <AlertTriangle className="h-3 w-3" />
                  RPC ERROR
                </span>
              ) : liveTx.matchesRecordedFinality ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-ledger-mono font-semibold text-[#1B5E3F]">
                  <CheckCircle2 className="h-3 w-3" />
                  VERIFIED ON-CHAIN
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-ledger-mono font-semibold text-[#9C6615]">
                  <AlertTriangle className="h-3 w-3" />
                  STATUS DIFF
                </span>
              )
            ) : (
              <span className="text-[10px] font-ledger-mono text-[#78736A]">
                AWAITING LIVE CHECK
              </span>
            )}
          </div>
          <div className="mt-1.5 font-ledger-mono text-[11px] text-[#141518]">
            {liveTx ? (
              liveTx.error ? (
                <span className="text-[#9B2226]">{liveTx.error}</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm border border-[#CFC7B5] bg-white px-2 py-0.5">
                    {liveTx.statusName}
                  </span>
                  {liveTx.executionResultName && (
                    <span className="text-[#57544D]">{liveTx.executionResultName}</span>
                  )}
                  {liveTx.onChainDetail && (
                    <span className="text-[#1B5E3F]">{liveTx.onChainDetail}</span>
                  )}
                </div>
              )
            ) : (
              <span className="text-[#78736A]">
                Click &ldquo;Verify Live On-Chain&rdquo; above to query https://studio.genlayer.com/api.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Dossier Body */}
      <div className="p-5 space-y-4">
        {/* Work & Clause */}
        {(item.workTitle || item.elementClause) && (
          <div className="rounded-sm border border-[#E6E0D3] bg-white p-3.5">
            {item.workTitle && (
              <div className="text-xs font-semibold uppercase tracking-wider text-[#8C6D2E]">
                Target Literary Work: {item.workTitle}
              </div>
            )}
            {item.elementClause && (
              <blockquote className="mt-1.5 font-editorial text-base italic text-[#141518] border-l-2 border-[#B58D3D] pl-3">
                &ldquo;{item.elementClause}&rdquo;
              </blockquote>
            )}
          </div>
        )}

        {/* Hashes & Source URL */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <CopyChip label="clause_sha256" value={item.clauseSha256} />
          <CopyChip label="snippet_sha256" value={item.snippetSha256} />
          <div className="rounded-sm border border-[#DED7C8] bg-[#FAF7F0] px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
                <LinkIcon className="h-2.5 w-2.5" />
                Immutable Source
              </span>
              {urlCheck && (
                <span
                  className={`text-[9px] font-ledger-mono uppercase px-1.5 py-0.2 rounded-sm ${
                    urlCheck.valid
                      ? 'bg-[#E8F3EC] text-[#14472F]'
                      : 'bg-[#FCEAEA] text-[#7A181B]'
                  }`}
                >
                  {urlCheck.sourceType || 'UNVERIFIED'}
                </span>
              )}
            </div>
            {item.evidenceUrl ? (
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <a
                  href={item.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-ledger-mono text-[11px] text-[#1F4E78] hover:underline truncate"
                  title={item.evidenceUrl}
                >
                  <span className="truncate">{item.evidenceUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            ) : (
              <div className="font-ledger-mono text-[11px] text-[#8E897F] mt-0.5">—</div>
            )}
            {item.startLine != null && item.endLine != null && (
              <div className="mt-1 font-ledger-mono text-[10px] text-[#57544D]">
                Lines {item.startLine}–{item.endLine}
              </div>
            )}
          </div>
        </div>

        {/* Literary Snippet with Verbatim Evidence Quote Highlighted */}
        {(item.snippetText || item.evidenceQuote) && (
          <div className="rounded-sm border border-[#CFC7B5] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6E0D3] bg-[#FAF7F0] px-3.5 py-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#141518]">
                <FileSearch className="h-3.5 w-3.5 text-[#8C6D2E]" />
                Archival Literary Snippet &amp; Verbatim Quote Match
              </div>
              <div className="flex items-center gap-2">
                {quoteSegments && (
                  <span
                    className={`font-ledger-mono text-[10px] px-2 py-0.5 rounded-sm ${
                      quoteSegments.found
                        ? 'bg-[#E8F3EC] text-[#14472F]'
                        : 'bg-[#FDF3DF] text-[#754B0C]'
                    }`}
                  >
                    {quoteSegments.found
                      ? 'VERBATIM SUBSTRING MATCHED'
                      : 'QUOTE NOT IN EXCERPT'}
                  </span>
                )}
                {item.snippetText && item.snippetSha256 && (
                  <button
                    type="button"
                    onClick={handleBrowserShaVerify}
                    className="rounded-sm border border-[#CFC7B5] bg-white px-2 py-0.5 font-ledger-mono text-[10px] text-[#141518] hover:bg-[#EFEAE0] cursor-pointer"
                  >
                    Verify SHA-256 in Browser
                  </button>
                )}
              </div>
            </div>

            {browserShaMatch !== 'idle' && (
              <div
                className={`border-b px-3.5 py-1.5 font-ledger-mono text-[11px] ${
                  browserShaMatch === 'match'
                    ? 'border-[#B9DEC7] bg-[#E8F3EC] text-[#14472F]'
                    : 'border-[#E6B8B8] bg-[#FCEAEA] text-[#7A181B]'
                }`}
              >
                {browserShaMatch === 'match'
                  ? `WebCrypto SHA-256 matches snippet_sha256 (${truncateMiddle(browserShaValue, 12, 10)})`
                  : `WebCrypto SHA-256 mismatch: computed ${browserShaValue}`}
              </div>
            )}

            <div className="p-4 space-y-3">
              {item.snippetText ? (
                <pre className="whitespace-pre-wrap font-editorial text-[15px] leading-relaxed text-[#222428]">
                  {quoteSegments && quoteSegments.found ? (
                    <>
                      {quoteSegments.before}
                      <mark
                        className={
                          isContradiction
                            ? 'evidence-highlight-contradict'
                            : 'evidence-highlight'
                        }
                      >
                        {quoteSegments.match}
                      </mark>
                      {quoteSegments.after}
                    </>
                  ) : (
                    item.snippetText
                  )}
                </pre>
              ) : null}

              {item.evidenceQuote && (
                <div className="rounded-sm border border-[#E6E0D3] bg-[#FAF7F0] px-3 py-2 text-xs">
                  <span className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D] mr-2">
                    Verbatim evidence_quote:
                  </span>
                  <span className="font-editorial italic font-medium text-[#141518]">
                    &ldquo;{item.evidenceQuote}&rdquo;
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rationale & Deterministic Economic Settlement */}
        {(item.rationale || item.economicEffect) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {item.rationale && (
              <div className="rounded-sm border border-[#E6E0D3] bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
                  Validator Consensus Rationale
                </div>
                <p className="mt-1 text-[#141518] leading-relaxed">{item.rationale}</p>
              </div>
            )}
            {item.economicEffect && (
              <div className="rounded-sm border border-[#E6E0D3] bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
                  Deterministic Python Settlement
                </div>
                <p className="mt-1 text-[#141518] leading-relaxed">{item.economicEffect}</p>
              </div>
            )}
          </div>
        )}

        {/* Native GenLayer Appeal Window */}
        <AppealWindowPanel
          stage={effectiveLifecycle.stage}
          appealWindow={effectiveLifecycle.appealWindow}
          txHash={item.txHash}
          appealNote={
            item.appealWindowNote ||
            'Transaction completed GenLayer Optimistic Democracy validator consensus and cleared the native appeal window into durable finality.'
          }
        />
      </div>
    </article>
  );
}

export function ProofInspector({
  proof,
  liveSnapshot,
  isVerifyingLive,
  onVerifyLive,
}: {
  proof: NormalizedProofBundle;
  liveSnapshot: LiveReadSnapshot | null;
  isVerifyingLive: boolean;
  onVerifyLive: () => void;
}) {
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | CaseOutcome>('ALL');
  const verifiedCount = proof.cases.filter(
    (c) => c.txHash && liveSnapshot?.txVerifications[c.txHash]?.matchesRecordedFinality
  ).length;
  const visibleCases =
    outcomeFilter === 'ALL'
      ? proof.cases
      : proof.cases.filter((c) => c.outcome === outcomeFilter);

  return (
    <section className="space-y-6">
      {/* Dual Ledger Header: Recorded Proof vs Live On-Chain Read */}
      <div className="rounded-sm border border-[#141518] bg-[#FDFBF7] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 font-ledger-mono text-[11px] uppercase tracking-widest text-[#8C6D2E]">
              <ShieldCheck className="h-3.5 w-3.5" />
              No-Wallet StudioNet Proof Inspector
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-[#141518]">
              Recorded StudioNet Proof vs. Live On-Chain Verification
            </h2>
            <p className="mt-1.5 text-sm text-[#57544D] leading-relaxed">
              Every clearance pool judgment, verbatim literary quote, cryptographic SHA-256 digest,
              and finalized StudioNet transaction is bundled below for zero-wallet auditing and can
              be cross-checked live against <code className="text-[#141518]">{proof.rpcUrl}</code>.
            </p>
          </div>

          <button
            type="button"
            onClick={onVerifyLive}
            disabled={isVerifyingLive || proof.isPlaceholder}
            className="inline-flex items-center gap-2 rounded-sm border border-[#141518] bg-[#141518] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#FDFBF7] hover:bg-[#2B2D33] disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isVerifyingLive ? 'animate-spin' : ''}`} />
            {isVerifyingLive ? 'Querying StudioNet...' : 'Verify Live On-Chain'}
          </button>
        </div>

        {/* Recorded Metadata & Live Comparison Summary */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#DED7C8]">
          {/* Left: Recorded Proof */}
          <div className="rounded-sm border border-[#DED7C8] bg-[#FAF7F0] p-3.5 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#57544D]">
              1. Recorded StudioNet Proof (Bundled Artifact)
            </div>
            {proof.isPlaceholder ? (
              <div className="rounded-sm border border-[#D9A74A] bg-[#FDF3DF] p-2.5 text-xs text-[#754B0C]">
                Awaiting live deployment proof from <code>deploy/proof.json</code>. Once{' '}
                <code>@contract</code> finalizes all 6 StudioNet transactions, real hashes and
                snippets appear here.
              </div>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-[10px] uppercase text-[#78736A]">Contract Address</dt>
                  <dd className="font-ledger-mono text-[11px] mt-0.5">
                    <a
                      href={buildExplorerAddressUrl(proof.contractAddress, proof.explorerBaseUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#1F4E78] hover:underline"
                    >
                      {truncateMiddle(proof.contractAddress, 10, 8)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[#78736A]">Deployer</dt>
                  <dd className="font-ledger-mono text-[11px] mt-0.5 text-[#141518]">
                    {truncateMiddle(proof.deployerAddress, 10, 8) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[#78736A]">GenVM Runner Hash</dt>
                  <dd className="font-ledger-mono text-[11px] mt-0.5 text-[#141518]">
                    {truncateMiddle(proof.runnerHash || '', 12, 8) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[#78736A]">Recorded Cases</dt>
                  <dd className="font-ledger-mono text-[11px] mt-0.5 text-[#141518]">
                    {proof.cases.length} finalized exhibits
                  </dd>
                </div>
              </dl>
            )}
          </div>

          {/* Right: Live StudioNet Read */}
          <div className="rounded-sm border border-[#DED7C8] bg-white p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#57544D]">
                2. Live On-Chain StudioNet Read (Chain {proof.chainId})
              </span>
              {liveSnapshot && (
                <span className="font-ledger-mono text-[10px] text-[#57544D]">
                  Checked {new Date(liveSnapshot.fetchedAt).toLocaleTimeString()}
                </span>
              )}
            </div>

            {liveSnapshot ? (
              liveSnapshot.error ? (
                <div className="rounded-sm border border-[#9B2226] bg-[#FCEAEA] p-2.5 text-xs text-[#7A181B]">
                  Live RPC error: {liveSnapshot.error}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-sm border border-[#E6E0D3] bg-[#FAF7F0] p-2">
                    <div className="text-[10px] uppercase text-[#78736A]">Tx Finality Match</div>
                    <div className="font-ledger-mono text-sm font-semibold text-[#1B5E3F] mt-0.5">
                      {verifiedCount} / {proof.cases.filter((c) => Boolean(c.txHash)).length}
                    </div>
                  </div>
                  <div className="rounded-sm border border-[#E6E0D3] bg-[#FAF7F0] p-2">
                    <div className="text-[10px] uppercase text-[#78736A]">Live Pools</div>
                    <div className="font-ledger-mono text-sm font-semibold text-[#141518] mt-0.5">
                      {liveSnapshot.pools.length}
                    </div>
                  </div>
                  <div className="rounded-sm border border-[#E6E0D3] bg-[#FAF7F0] p-2">
                    <div className="text-[10px] uppercase text-[#78736A]">Live Claims</div>
                    <div className="font-ledger-mono text-sm font-semibold text-[#141518] mt-0.5">
                      {liveSnapshot.claims.length}
                    </div>
                  </div>
                </div>
              )
            ) : (
              <p className="text-xs text-[#78736A] leading-relaxed">
                No live RPC call issued yet, or waiting for initial refresh. Click{' '}
                <strong>Verify Live On-Chain</strong> to query live view state and transaction
                receipts directly from StudioNet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Case Exhibits */}
      {proof.cases.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[#CFC7B5] bg-[#FAF7F0] p-8 text-center">
          <p className="font-editorial text-lg text-[#141518]">
            StudioNet Proof Exhibits Pending Finalization
          </p>
          <p className="mt-1 text-xs text-[#57544D]">
            This view automatically renders all 6 finalized exhibits (TOO_VAGUE, CLEARABLE,
            ORIGIN_VERIFIED, CONTRADICTED_BY_SOURCE, INSUFFICIENT_EVIDENCE, and Prompt-Injection
            Defense) as soon as <code>deploy/proof.json</code> is bundled.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick Outcome Filter Bar */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-[#DED7C8] bg-[#FAF7F0] px-3.5 py-2.5">
            <span className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D] mr-1">
              Filter Exhibits:
            </span>
            {(
              [
                ['ALL', `All (${proof.cases.length})`],
                ['TOO_VAGUE', 'TOO_VAGUE'],
                ['CLEARABLE', 'CLEARABLE'],
                ['ORIGIN_VERIFIED', 'ORIGIN_VERIFIED'],
                ['CONTRADICTED_BY_SOURCE', 'CONTRADICTED'],
                ['INSUFFICIENT_EVIDENCE', 'INSUFFICIENT'],
                ['PROMPT_INJECTION_DEFENSE', 'INJECTION DEFENSE'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setOutcomeFilter(key)}
                className={`rounded-sm border px-2 py-0.5 font-ledger-mono text-[10px] font-medium cursor-pointer ${
                  outcomeFilter === key
                    ? 'border-[#141518] bg-[#141518] text-[#FDFBF7]'
                    : 'border-[#CFC7B5] bg-white text-[#57544D] hover:text-[#141518]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            {visibleCases.map((item) => (
              <CaseDossierCard
                key={item.caseId}
                item={item}
                liveSnapshot={liveSnapshot}
                explorerBaseUrl={proof.explorerBaseUrl}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
