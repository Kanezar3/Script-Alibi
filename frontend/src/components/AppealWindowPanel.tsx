import { ShieldAlert, Scale, CheckCircle2, Clock } from 'lucide-react';
import type { AppealWindowState, TxLifecycleStage } from '../lib/txTracker';

const STEPS: { key: TxLifecycleStage; label: string }[] = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'pending', label: 'Pending' },
  { key: 'proposing', label: 'Consensus' },
  { key: 'accepted', label: 'Accepted (Appeal)' },
  { key: 'finalized-success', label: 'Finalized' },
];

function getStepIndex(stage: TxLifecycleStage): number {
  if (stage === 'finalized-error') return 4;
  return STEPS.findIndex((s) => s.key === stage);
}

export function AppealWindowPanel({
  stage,
  appealWindow,
  txHash,
  appealNote,
  canAppeal,
  onAppeal,
  appealingBusy,
}: {
  stage: TxLifecycleStage;
  appealWindow: AppealWindowState;
  txHash?: string;
  appealNote?: string;
  canAppeal?: boolean;
  onAppeal?: (txHash: string) => void;
  appealingBusy?: boolean;
}) {
  const activeIdx = getStepIndex(stage);

  return (
    <div className="rounded-sm border border-[#DED7C8] bg-[#FAF7F0] p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 font-semibold text-[#141518] uppercase tracking-wider text-[11px]">
          <Scale className="h-3.5 w-3.5 text-[#8C6D2E]" />
          GenLayer Optimistic Democracy &amp; Appeal Window
        </div>
        {appealWindow === 'open' && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-[#B58D3D] bg-[#FBF2DC] px-2 py-0.5 font-ledger-mono text-[10px] font-semibold text-[#6B4E16]">
            <Clock className="h-3 w-3" />
            APPEAL WINDOW OPEN
          </span>
        )}
        {appealWindow === 'appealing' && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-[#9C6615] bg-[#FDF3DF] px-2 py-0.5 font-ledger-mono text-[10px] font-semibold text-[#754B0C]">
            <ShieldAlert className="h-3 w-3" />
            APPEAL COMMITTEE ACTIVE
          </span>
        )}
        {appealWindow === 'closed-finalized' && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-[#1B5E3F] bg-[#E8F3EC] px-2 py-0.5 font-ledger-mono text-[10px] font-semibold text-[#14472F]">
            <CheckCircle2 className="h-3 w-3" />
            APPEAL WINDOW CLOSED · FINALIZED
          </span>
        )}
      </div>

      {/* 5-step horizontal lifecycle indicator */}
      <div className="grid grid-cols-5 gap-1">
        {STEPS.map((step, idx) => {
          const isFinalError = stage === 'finalized-error' && idx === 4;
          const reached = idx <= activeIdx;
          const isCurrent = idx === activeIdx;

          let barColor = 'bg-[#E5DFD2] text-[#78736A] border-[#DED7C8]';
          if (isFinalError) {
            barColor = 'bg-[#FCEAEA] text-[#7A181B] border-[#9B2226] font-semibold';
          } else if (reached) {
            barColor = isCurrent
              ? 'bg-[#141518] text-[#FDFBF7] border-[#141518] font-semibold'
              : 'bg-[#E9E2D2] text-[#141518] border-[#C9C1B0]';
          }

          return (
            <div
              key={step.key}
              className={`rounded-sm border px-1.5 py-1 text-center text-[10px] font-ledger-mono truncate ${barColor}`}
              title={isFinalError ? 'Finalized (Error)' : step.label}
            >
              {isFinalError ? 'Finalized (Err)' : step.label}
            </div>
          );
        })}
      </div>

      {appealNote && (
        <p className="mt-2 text-[11px] text-[#57544D] leading-relaxed">{appealNote}</p>
      )}

      {appealWindow === 'open' && txHash && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#E6E0D3] pt-2">
          <p className="text-[11px] text-[#6B4E16]">
            Validators accepted the leader receipt. Any participant can post an appeal bond before finalization.
          </p>
          {canAppeal && onAppeal && (
            <button
              type="button"
              disabled={appealingBusy}
              onClick={() => onAppeal(txHash)}
              className="rounded-sm border border-[#8C6D2E] bg-[#141518] px-2.5 py-1 text-[11px] font-medium text-[#FDFBF7] hover:bg-[#2C2D33] disabled:opacity-50 cursor-pointer"
            >
              {appealingBusy ? 'Submitting Appeal...' : 'Appeal Decision'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
