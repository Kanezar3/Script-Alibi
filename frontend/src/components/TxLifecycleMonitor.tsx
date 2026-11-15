import { useState } from 'react';
import {
  Activity,
  ExternalLink,
  Layers,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { NormalizedProofBundle } from '../types/scriptAlibi';
import type { TrackedTransaction } from '../lib/txTracker';
import { isTerminalLifecycleStage } from '../lib/txTracker';
import { buildExplorerTxUrl } from '../lib/proofAdapter';
import { truncateMiddle } from '../lib/validation';
import { LifecycleBadge } from './VerdictBadge';
import { AppealWindowPanel } from './AppealWindowPanel';

export function TxLifecycleMonitor({
  proof,
  transactions,
  explorerBaseUrl,
  isPolling,
  walletAddress,
  onPollAll,
  onAddManualHash,
  onLoadRecordedTxs,
  onRemoveTx,
  onClearFinalized,
  onAppealTx,
  appealingHash,
}: {
  proof: NormalizedProofBundle;
  transactions: TrackedTransaction[];
  explorerBaseUrl: string;
  isPolling: boolean;
  walletAddress: string | null;
  onPollAll: () => void;
  onAddManualHash: (hash: string, label: string) => void;
  onLoadRecordedTxs: (items: { hash: string; action: string; label: string }[]) => void;
  onRemoveTx: (hash: string) => void;
  onClearFinalized: () => void;
  onAppealTx: (hash: string) => void;
  appealingHash: string | null;
}) {
  const [manualHash, setManualHash] = useState('');
  const [manualLabel, setManualLabel] = useState('StudioNet Transaction');
  const [hashError, setHashError] = useState('');

  const activeCount = transactions.filter((t) => !isTerminalLifecycleStage(t.stage)).length;
  const proofTxs = proof.cases.filter((c) => Boolean(c.txHash));
  const trackedHashSet = new Set(transactions.map((t) => t.hash.toLowerCase()));

  const handleSubmitHash = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(cleaned)) {
      setHashError('Enter a valid 32-byte StudioNet transaction hash (0x + 64 hex chars).');
      return;
    }
    setHashError('');
    onAddManualHash(cleaned, manualLabel.trim() || 'StudioNet Transaction');
    setManualHash('');
  };

  const handleLoadAllExhibits = () => {
    onLoadRecordedTxs(
      proofTxs.map((c) => ({
        hash: c.txHash,
        action: c.action,
        label: `EX-${String(c.caseNumber).padStart(2, '0')} · ${c.outcome}`,
      }))
    );
  };

  return (
    <section className="space-y-5">
      {/* Compact Consensus Telemetry Command Strip */}
      <div className="rounded-[2px] border border-[#141518] bg-[#FDFBF7] px-4 py-3.5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-ledger-mono text-[10px] font-semibold uppercase tracking-widest text-[#8C6D2E]">
              <Activity className="h-3.5 w-3.5" />
              Consensus Telemetry · localStorage Persisted
            </span>
            <span className="font-ledger-mono text-[11px] text-[#57544D]">
              8s auto-poll · {transactions.length} tracked ({activeCount} active)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onPollAll}
              disabled={isPolling || transactions.length === 0}
              className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#111215] bg-[#111215] px-3 py-1.5 font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#F6F2EA] hover:bg-[#2B2D33] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${isPolling ? 'animate-spin' : ''}`} />
              {isPolling ? 'Polling RPC...' : `Poll Status (${activeCount} active)`}
            </button>
            {transactions.some((t) => isTerminalLifecycleStage(t.stage)) && (
              <button
                type="button"
                onClick={onClearFinalized}
                className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-1.5 font-ledger-mono text-[10px] font-medium text-[#57544D] hover:text-[#141518] cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                Clear Finalized
              </button>
            )}
          </div>
        </div>

        {/* Recorded StudioNet Receipt Quick-Loader */}
        {proofTxs.length > 0 && (
          <div className="rounded-[2px] border border-[#DED7C8] bg-[#FAF7F0] px-3.5 py-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#141518]">
                <Layers className="h-3.5 w-3.5 text-[#8C6D2E]" />
                Recorded StudioNet Receipt Quick-Loader
              </span>
              <button
                type="button"
                onClick={handleLoadAllExhibits}
                className="rounded-[2px] border border-[#141518] bg-[#111215] px-2.5 py-1 font-ledger-mono text-[10px] font-semibold uppercase tracking-wider text-[#F6F2EA] hover:bg-[#2B2D33] cursor-pointer"
              >
                Load All {proofTxs.length} Exhibit Txs
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {proofTxs.map((c) => {
                const alreadyTracked = trackedHashSet.has(c.txHash.toLowerCase());
                return (
                  <button
                    key={c.caseId}
                    type="button"
                    onClick={() =>
                      onLoadRecordedTxs([
                        {
                          hash: c.txHash,
                          action: c.action,
                          label: `EX-${String(c.caseNumber).padStart(2, '0')} · ${c.outcome}`,
                        },
                      ])
                    }
                    className={`rounded-[2px] border px-2 py-1 font-ledger-mono text-[10px] cursor-pointer ${
                      alreadyTracked
                        ? 'border-[#1B5E3F] bg-[#E8F3EC] text-[#14472F]'
                        : 'border-[#CFC7B5] bg-white text-[#141518] hover:border-[#141518] hover:bg-[#EFEAE0]'
                    }`}
                    title={c.txHash}
                  >
                    EX-{String(c.caseNumber).padStart(2, '0')} · {c.outcome}
                    {alreadyTracked ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual tx hash tracker */}
        <form
          onSubmit={handleSubmitHash}
          className="pt-2 border-t border-[#E6E0D3] grid grid-cols-1 md:grid-cols-12 gap-2.5"
        >
          <input
            type="text"
            value={manualHash}
            onChange={(e) => setManualHash(e.target.value)}
            placeholder="Track any StudioNet tx hash (0x...)"
            className="md:col-span-7 rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-2 font-ledger-mono text-xs text-[#141518] placeholder:text-[#8E897F] focus:border-[#141518] focus:outline-none"
          />
          <input
            type="text"
            value={manualLabel}
            onChange={(e) => setManualLabel(e.target.value)}
            placeholder="Label (e.g. Case 3 Claim)"
            className="md:col-span-3 rounded-[2px] border border-[#CFC7B5] bg-white px-3 py-2 text-xs text-[#141518] placeholder:text-[#8E897F] focus:border-[#141518] focus:outline-none"
          />
          <button
            type="submit"
            className="md:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-[2px] border border-[#8C6D2E] bg-[#FAF7F0] px-3 py-2 font-ledger-mono text-[11px] font-semibold text-[#141518] hover:bg-[#EFEAE0] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Track Tx
          </button>
          {hashError && (
            <p className="md:col-span-12 text-xs text-[#9B2226] font-medium">{hashError}</p>
          )}
        </form>
      </div>

      {transactions.length === 0 ? (
        <div className="rounded-[2px] border border-dashed border-[#CFC7B5] bg-[#FAF7F0] px-5 py-7 text-center">
          <p className="font-editorial text-lg text-[#141518]">
            Select any Recorded StudioNet Exhibit above or paste a 32-byte tx hash
          </p>
          <p className="mt-1 text-xs text-[#57544D]">
            Click <strong>Load All {proofTxs.length} Exhibit Txs</strong> above to inspect the
            5-stage Optimistic Democracy consensus pipeline against live StudioNet RPC without
            connecting a wallet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map((tx) => (
            <div
              key={tx.hash}
              className="rounded-[2px] border border-[#CFC7B5] bg-[#FDFBF7] p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#8C6D2E] font-semibold">
                      {tx.action}
                    </span>
                    <span className="text-[#CFC7B5]">·</span>
                    <span className="text-sm font-semibold text-[#141518]">{tx.label}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 font-ledger-mono text-[11px] text-[#57544D]">
                    <a
                      href={buildExplorerTxUrl(tx.hash, explorerBaseUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#1F4E78] hover:underline"
                    >
                      {truncateMiddle(tx.hash, 12, 10)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {tx.rawStatusName && <span>RPC Status: {tx.rawStatusName}</span>}
                    {tx.executionResultName && <span>Result: {tx.executionResultName}</span>}
                    <span>Updated {new Date(tx.updatedAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <LifecycleBadge stage={tx.stage} />
                  <button
                    type="button"
                    onClick={() => onRemoveTx(tx.hash)}
                    className="rounded-[2px] border border-[#DED7C8] bg-white p-1.5 text-[#57544D] hover:text-[#9B2226] cursor-pointer"
                    title="Remove from tracker"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {tx.errorMessage && (
                <div className="rounded-[2px] border border-[#E6B8B8] bg-[#FCEAEA] px-3 py-2 text-xs text-[#7A181B]">
                  {tx.errorMessage}
                </div>
              )}

              <AppealWindowPanel
                stage={tx.stage}
                appealWindow={tx.appealWindow}
                txHash={tx.hash}
                canAppeal={Boolean(walletAddress) && tx.appealWindow === 'open'}
                onAppeal={onAppealTx}
                appealingBusy={appealingHash === tx.hash}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
