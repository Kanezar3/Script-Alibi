import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  AlertTriangle,
  Columns2,
  List,
} from 'lucide-react';
import type {
  CaseOutcome,
  LiveReadSnapshot,
  NormalizedProofBundle,
  ProofCaseRecord,
} from '../types/scriptAlibi';
import { buildExplorerTxUrl } from '../lib/proofAdapter';
import {
  computeSha256Hex,
  splitSnippetAroundQuote,
  truncateMiddle,
  validateImmutableEvidenceUrl,
} from '../lib/validation';
import { mapGenLayerStatusToLifecycle } from '../lib/txTracker';
import { VerdictBadge, LifecycleBadge } from './VerdictBadge';
import { AppealWindowPanel } from './AppealWindowPanel';
import {
  buildClearanceCertificatePayload,
  formatClearanceCertificateMarkdown,
  sanitizeFilenameSlug,
} from '../lib/clearanceCertificate';

function InlineHashRow({ label, value }: { label: string; value?: string }) {
  const [copied, setCopied] = useState(false);

  if (!value) {
    return (
      <div className="flex items-center justify-between gap-2 py-1 text-[11px]">
        <span className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#78736A]">
          {label}
        </span>
        <span className="font-ledger-mono text-[#8E897F]">—</span>
      </div>
    );
  }

  const handleCopy = () => {
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D]">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span
          className="font-ledger-mono text-[11px] text-[#141518]"
          title={value}
        >
          {truncateMiddle(value, 12, 10)}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-[2px] border border-[#CFC7B5] bg-[#FAF7F0] px-1.5 py-0.5 font-ledger-mono text-[9px] uppercase text-[#57544D] hover:border-[#141518] hover:text-[#141518] cursor-pointer"
          title={`Copy ${label}`}
        >
          <Copy className="h-2.5 w-2.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function ManuscriptPlate({
  snippetText,
  startLine,
  endLine,
  evidenceQuote,
  isContradiction,
}: {
  snippetText: string;
  startLine: number;
  endLine?: number | null;
  evidenceQuote?: string;
  isContradiction: boolean;
}) {
  const normalizedText = snippetText.replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n');
  const quoteSegments = evidenceQuote
    ? splitSnippetAroundQuote(normalizedText, evidenceQuote)
    : null;

  const matchStart = quoteSegments?.found ? quoteSegments.before.length : -1;
  const matchEnd =
    quoteSegments?.found ? matchStart + quoteSegments.match.length : -1;
  const markClass = isContradiction
    ? 'evidence-highlight-contradict'
    : 'evidence-highlight';

  // Single-line normalized excerpt: render editorial Line-Span Margin Column
  if (lines.length === 1) {
    const line = lines[0];
    const spanEnd = endLine ?? startLine;
    return (
      <div className="flex items-stretch border-y border-[#DED7C8] bg-[#FCFBF8]">
        <div
          className="w-20 shrink-0 select-none border-r border-[#DED7C8] bg-[#F3EFE6] px-2.5 py-3 flex flex-col items-center justify-between text-center font-ledger-mono text-[10px] text-[#57544D]"
          aria-hidden="true"
        >
          <span className="font-semibold text-[#141518]">L{startLine}</span>
          <div className="my-1.5 flex flex-col items-center gap-1 text-[#8C6D2E]">
            <span className="h-4 w-[1px] bg-[#CFC7B5]" />
            <span className="text-[9px] tracking-widest uppercase text-[#78736A]">
              EXCERPT
            </span>
            <span className="h-4 w-[1px] bg-[#CFC7B5]" />
          </div>
          <span className="font-semibold text-[#141518]">L{spanEnd}</span>
        </div>

        <div className="flex-1 px-4 py-3.5 font-editorial text-[15.5px] leading-[1.7] text-[#1E2024] break-words">
          {matchStart !== -1 ? (
            <>
              {line.slice(0, matchStart)}
              <mark className={markClass}>{line.slice(matchStart, matchEnd)}</mark>
              {line.slice(matchEnd)}
            </>
          ) : (
            line
          )}
        </div>
      </div>
    );
  }

  // Multi-line excerpt: render line-by-line monospace gutter
  let cursor = 0;

  return (
    <div className="overflow-x-auto border-y border-[#DED7C8] bg-[#FCFBF8]">
      <div className="divide-y divide-[#F0EBE0] font-editorial text-[15.5px] leading-[1.7] text-[#1E2024]">
        {lines.map((line, idx) => {
          const lineStart = cursor;
          const lineEnd = lineStart + line.length;
          cursor = lineEnd + 1;

          const lineNum = startLine + idx;
          let content: React.ReactNode = line || '\u00A0';

          if (matchStart !== -1 && matchEnd > lineStart && matchStart < lineEnd) {
            const relStart = Math.max(0, matchStart - lineStart);
            const relEnd = Math.min(line.length, matchEnd - lineStart);
            content = (
              <>
                {line.slice(0, relStart)}
                <mark className={markClass}>{line.slice(relStart, relEnd)}</mark>
                {line.slice(relEnd)}
              </>
            );
          }

          return (
            <div key={lineNum} className="flex items-stretch">
              <span
                className="w-16 shrink-0 select-none border-r border-[#DED7C8] bg-[#F3EFE6] px-2.5 py-1 text-right font-ledger-mono text-[11px] text-[#78736A]"
                aria-hidden="true"
              >
                {lineNum}
              </span>
              <span className="flex-1 whitespace-pre-wrap px-4 py-1 break-words">
                {content}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function triggerBrowserDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExhibitCertificate({
  item,
  proof,
  liveSnapshot,
  explorerBaseUrl,
}: {
  item: ProofCaseRecord;
  proof: NormalizedProofBundle;
  liveSnapshot: LiveReadSnapshot | null;
  explorerBaseUrl: string;
}) {
  const [browserShaMatch, setBrowserShaMatch] = useState<'idle' | 'match' | 'mismatch'>('idle');
  const [browserShaValue, setBrowserShaValue] = useState<string>('');

  useEffect(() => {
    setBrowserShaMatch('idle');
    setBrowserShaValue('');
  }, [item.caseId]);

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
    <article className="rounded-[2px] border border-[#141518] bg-[#FDFBF7] shadow-[0_1px_0_rgba(20,21,24,0.08)]">
      {/* Certificate Header */}
      <div className="border-b border-[#DED7C8] bg-[#FAF6ED] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-ledger-mono uppercase tracking-wider text-[#57544D]">
              <span className="font-semibold text-[#111215]">
                EX-{String(item.caseNumber).padStart(2, '0')}
              </span>
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
              <p className="mt-1 text-xs text-[#57544D] leading-relaxed">{item.subtitle}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <VerdictBadge outcome={item.outcome} rawVerdict={item.rawVerdict} />
            <LifecycleBadge stage={effectiveLifecycle.stage} />
            <div className="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const payload = buildClearanceCertificatePayload(proof, item);
                  const md = formatClearanceCertificateMarkdown(payload);
                  triggerBrowserDownload(
                    `script-alibi-ex-${String(item.caseNumber).padStart(2, '0')}-${sanitizeFilenameSlug(item.title)}.md`,
                    md,
                    'text/markdown;charset=utf-8'
                  );
                }}
                className="inline-flex items-center gap-1 rounded-[2px] border border-[#CFC7B5] bg-white px-2 py-0.5 font-ledger-mono text-[10px] font-semibold text-[#141518] hover:border-[#141518] cursor-pointer"
                title="Download Chain-of-Title Clearance Certificate (Markdown)"
              >
                <Download className="h-3 w-3" />
                Cert .md
              </button>
              <button
                type="button"
                onClick={() => {
                  const payload = buildClearanceCertificatePayload(proof, item);
                  triggerBrowserDownload(
                    `script-alibi-ex-${String(item.caseNumber).padStart(2, '0')}-${sanitizeFilenameSlug(item.title)}.json`,
                    JSON.stringify(payload, null, 2),
                    'application/json;charset=utf-8'
                  );
                }}
                className="inline-flex items-center gap-1 rounded-[2px] border border-[#CFC7B5] bg-white px-2 py-0.5 font-ledger-mono text-[10px] font-semibold text-[#141518] hover:border-[#141518] cursor-pointer"
                title="Download Machine-Verifiable Proof Dossier (JSON)"
              >
                <Download className="h-3 w-3" />
                Proof .json
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Band 1: Proof Parity Strip (Recorded vs Live StudioNet RPC) */}
      <div className="grid grid-cols-1 md:grid-cols-2 border-b border-[#DED7C8] md:divide-x divide-[#DED7C8] text-xs">
        <div className="px-5 py-2.5 border-b md:border-b-0 border-[#DED7C8] bg-[#FDFBF7]">
          <div className="font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
            Recorded Proof (deploy/proof.json)
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-ledger-mono">
            <span className="rounded-[2px] bg-[#EFEAE0] px-2 py-0.5 text-[10px] font-semibold text-[#141518]">
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

        <div className="px-5 py-2.5 bg-[#FAF8F3]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
              Live StudioNet RPC Read
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
          <div className="mt-1 font-ledger-mono text-[11px] text-[#141518]">
            {liveTx ? (
              liveTx.error ? (
                <span className="text-[#9B2226]">{liveTx.error}</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[2px] border border-[#CFC7B5] bg-white px-2 py-0.5 text-[10px]">
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
                Click &ldquo;Verify Live StudioNet&rdquo; in the masthead to query RPC.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Band 2: Side-by-Side Comparison Grid (Clause vs Consensus & Settlement) */}
      <div className="grid grid-cols-1 md:grid-cols-2 border-b border-[#DED7C8] md:divide-x divide-[#DED7C8]">
        {/* Left Column: Screenplay Element Clause + Immutable Source */}
        <div className="px-5 py-4 border-b md:border-b-0 border-[#DED7C8] flex flex-col justify-between space-y-3">
          <div>
            <div className="font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#8C6D2E]">
              Screenplay Element Clause
            </div>
            {item.workTitle && (
              <div className="mt-0.5 text-xs font-semibold text-[#141518]">
                {item.workTitle}
              </div>
            )}
            {item.elementClause ? (
              <blockquote className="mt-2 font-editorial text-[15.5px] italic text-[#141518] border-l-2 border-[#C89D42] pl-3 leading-relaxed">
                &ldquo;{item.elementClause}&rdquo;
              </blockquote>
            ) : (
              <p className="mt-2 text-xs text-[#78736A] italic">No element clause recorded.</p>
            )}
          </div>

          <div className="pt-2.5 border-t border-[#E6E0D3] divide-y divide-[#EFEAE0]">
            <InlineHashRow label="clause_sha256" value={item.clauseSha256} />
            {item.evidenceUrl && (
              <div className="pt-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D]">
                    Immutable Source
                  </span>
                  {urlCheck && (
                    <span
                      className={`text-[9px] font-ledger-mono uppercase px-1.5 py-0.5 rounded-[2px] ${
                        urlCheck.valid
                          ? 'bg-[#E8F3EC] text-[#14472F]'
                          : 'bg-[#FCEAEA] text-[#7A181B]'
                      }`}
                    >
                      {urlCheck.sourceType || 'UNVERIFIED'}
                    </span>
                  )}
                </div>
                <a
                  href={item.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-ledger-mono text-[11px] text-[#1F4E78] hover:underline truncate"
                  title={item.evidenceUrl}
                >
                  <span className="truncate">{item.evidenceUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                {item.startLine != null && item.endLine != null && (
                  <div className="font-ledger-mono text-[10px] text-[#57544D]">
                    Lines {item.startLine}–{item.endLine}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Validator Consensus Rationale & Deterministic Python Settlement */}
        <div className="px-5 py-4 flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            {item.rationale && (
              <div>
                <div className="font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#57544D]">
                  Validator Consensus Rationale
                </div>
                <p className="mt-1 text-xs text-[#141518] leading-relaxed">{item.rationale}</p>
              </div>
            )}
            {item.economicEffect && (
              <div className={item.rationale ? 'pt-3 border-t border-[#EFEAE0]' : ''}>
                <div className="font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#8C6D2E]">
                  Deterministic Python Settlement
                </div>
                <p className="mt-1 text-xs text-[#141518] leading-relaxed font-medium">
                  {item.economicEffect}
                </p>
              </div>
            )}
          </div>

          {item.snippetSha256 && (
            <div className="pt-2.5 border-t border-[#E6E0D3]">
              <InlineHashRow label="snippet_sha256" value={item.snippetSha256} />
            </div>
          )}
        </div>
      </div>

      {/* Band 3: Archival Manuscript Plate */}
      {(item.snippetText || item.evidenceQuote) && (
        <div className="border-b border-[#DED7C8] bg-[#FAF6ED]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
            <div className="font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#141518]">
              Archival Manuscript Plate
              {item.startLine != null && item.endLine != null && (
                <span className="ml-2 font-normal text-[#57544D]">
                  Lines {item.startLine}–{item.endLine}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {quoteSegments && (
                <span
                  className={`font-ledger-mono text-[10px] px-2 py-0.5 rounded-[2px] ${
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
                  className="rounded-[2px] border border-[#141518] bg-white px-2.5 py-0.5 font-ledger-mono text-[10px] font-medium text-[#141518] hover:bg-[#EFEAE0] cursor-pointer"
                >
                  Verify SHA-256 in Browser
                </button>
              )}
            </div>
          </div>

          {browserShaMatch !== 'idle' && (
            <div
              className={`border-t px-5 py-1.5 font-ledger-mono text-[11px] ${
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

          {item.snippetText && (
            <ManuscriptPlate
              snippetText={item.snippetText}
              startLine={item.startLine ?? 1}
              endLine={item.endLine}
              evidenceQuote={item.evidenceQuote}
              isContradiction={isContradiction}
            />
          )}

          {item.evidenceQuote && (
            <div className="px-5 py-2.5 text-xs bg-[#FAF6ED]">
              <span className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D] mr-2">
                Verbatim evidence_quote:
              </span>
              <span className="font-editorial italic font-medium text-[#141518]">
                &ldquo;{item.evidenceQuote}&rdquo;
              </span>
            </div>
          )}
        </div>
      )}

      {/* Band 4: Native GenLayer Appeal Window */}
      <div className="p-4 bg-[#FDFBF7]">
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
}: {
  proof: NormalizedProofBundle;
  liveSnapshot: LiveReadSnapshot | null;
  isVerifyingLive?: boolean;
  onVerifyLive?: () => void;
}) {
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | CaseOutcome>('ALL');
  const [viewMode, setViewMode] = useState<'split' | 'register'>('split');
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    proof.cases[0]?.caseId ?? ''
  );

  const visibleCases =
    outcomeFilter === 'ALL'
      ? proof.cases
      : proof.cases.filter((c) => c.outcome === outcomeFilter);

  useEffect(() => {
    if (visibleCases.length === 0) return;
    if (!visibleCases.some((c) => c.caseId === selectedCaseId)) {
      setSelectedCaseId(visibleCases[0].caseId);
    }
  }, [visibleCases, selectedCaseId]);

  const activeCase =
    visibleCases.find((c) => c.caseId === selectedCaseId) ?? visibleCases[0];

  return (
    <section className="space-y-4">
      {/* Single Sleek Hairline Toolbar: Docket Filters (left) + View Mode Toggle (right) */}
      {proof.cases.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CFC7B5] pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D] mr-1">
              Docket Filter:
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
                className={`rounded-[2px] border px-2 py-0.5 font-ledger-mono text-[10px] font-medium cursor-pointer ${
                  outcomeFilter === key
                    ? 'border-[#111215] bg-[#111215] text-[#F6F2EA]'
                    : 'border-[#CFC7B5] bg-[#FDFBF7] text-[#57544D] hover:border-[#141518] hover:text-[#141518]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-[2px] border border-[#CFC7B5] bg-[#FAF7F0] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 font-ledger-mono text-[10px] font-semibold uppercase tracking-wider cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-[#111215] text-[#F6F2EA]'
                  : 'text-[#57544D] hover:text-[#141518]'
              }`}
            >
              <Columns2 className="h-3 w-3" />
              Split Folio
            </button>
            <button
              type="button"
              onClick={() => setViewMode('register')}
              className={`inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 font-ledger-mono text-[10px] font-semibold uppercase tracking-wider cursor-pointer ${
                viewMode === 'register'
                  ? 'bg-[#111215] text-[#F6F2EA]'
                  : 'text-[#57544D] hover:text-[#141518]'
              }`}
            >
              <List className="h-3 w-3" />
              Full Register
            </button>
          </div>
        </div>
      )}

      {/* Main Exhibits Area */}
      {proof.cases.length === 0 ? (
        <div className="rounded-[2px] border border-dashed border-[#CFC7B5] bg-[#FAF7F0] p-8 text-center">
          <p className="font-editorial text-lg text-[#141518]">
            StudioNet Proof Exhibits Pending Finalization
          </p>
          <p className="mt-1 text-xs text-[#57544D]">
            All 6 finalized exhibits render automatically once <code>deploy/proof.json</code> is bundled.
          </p>
        </div>
      ) : viewMode === 'split' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Rail: Sticky Clearance Docket Index */}
          <aside className="lg:col-span-4 lg:sticky lg:top-6 rounded-[2px] border border-[#141518] bg-[#FDFBF7] overflow-hidden">
            <div className="border-b border-[#141518] bg-[#111215] px-4 py-2.5 flex items-center justify-between text-[#F6F2EA]">
              <span className="font-ledger-mono text-[10px] font-semibold uppercase tracking-widest">
                Clearance Docket Index
              </span>
              <span className="font-ledger-mono text-[10px] text-[#C89D42]">
                {visibleCases.length} / {proof.cases.length}
              </span>
            </div>

            <div className="divide-y divide-[#E6E0D3]">
              {visibleCases.map((item) => {
                const isSelected = activeCase?.caseId === item.caseId;
                const liveTx = item.txHash
                  ? liveSnapshot?.txVerifications[item.txHash]
                  : undefined;

                return (
                  <button
                    key={item.caseId}
                    type="button"
                    onClick={() => setSelectedCaseId(item.caseId)}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer border-l-[3px] ${
                      isSelected
                        ? 'border-l-[#C89D42] bg-[#FAF4E6]'
                        : 'border-l-transparent bg-[#FDFBF7] hover:bg-[#FAF7F0]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-ledger-mono text-[11px] font-semibold text-[#141518]">
                        EX-{String(item.caseNumber).padStart(2, '0')}
                      </span>

                      <span className="inline-flex items-center gap-1 font-ledger-mono text-[9px] uppercase">
                        {liveTx ? (
                          liveTx.error ? (
                            <span className="text-[#9B2226]" title={liveTx.error}>
                              ● RPC ERR
                            </span>
                          ) : liveTx.matchesRecordedFinality ? (
                            <span className="text-[#1B5E3F]">● VERIFIED</span>
                          ) : (
                            <span className="text-[#9C6615]">● DIFF</span>
                          )
                        ) : (
                          <span className="text-[#8E897F]">○ PENDING</span>
                        )}
                      </span>
                    </div>

                    <div className="mt-1 text-xs font-semibold text-[#141518] line-clamp-2 leading-snug">
                      {item.workTitle || item.title}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <VerdictBadge
                        outcome={item.outcome}
                        rawVerdict={item.rawVerdict}
                        compact
                      />
                      <span className="font-ledger-mono text-[10px] text-[#78736A]">
                        {item.action === 'create_clearance_pool' ? 'Pool' : 'Claim'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right Main Pane: Active Exhibit Clearance Certificate */}
          <div className="lg:col-span-8">
            {activeCase && (
              <ExhibitCertificate
                item={activeCase}
                proof={proof}
                liveSnapshot={liveSnapshot}
                explorerBaseUrl={proof.explorerBaseUrl}
              />
            )}
          </div>
        </div>
      ) : (
        /* Full Register Mode */
        <div className="space-y-5">
          {visibleCases.map((item) => (
            <ExhibitCertificate
              key={item.caseId}
              item={item}
              proof={proof}
              liveSnapshot={liveSnapshot}
              explorerBaseUrl={proof.explorerBaseUrl}
            />
          ))}
        </div>
      )}
    </section>
  );
}
