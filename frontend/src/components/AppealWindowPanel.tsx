import { ShieldAlert, Scale, CheckCircle2, Clock } from 'lucide-react';
import type { AppealWindowState, TxLifecycleStage } from '../lib/txTracker';

const STEPS: { key: TxLifecycleStage; label: string; short: string }[] = [
  { key: 'submitted', label: 'Submitted', short: '01 Sub' },
  { key: 'pending', label: 'Pending', short: '02 Pend' },
  { key: 'proposing', label: 'Consensus', short: '03 Cons' },
  { key: 'accepted', label: 'Accepted (Appeal)', short: '04 Acc' },
  { key: 'finalized-success', label: 'Finalized', short: '05 Fin' },
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
    <div className="rounded-[2px] border border-[#D8D0BF] bg-[#FAF7F0] px-3.5 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 font-ledger-mono font-semibold text-[#141518] uppercase tracking-wider text-[10px]">
          <Scale className="h-3.5 w-3.5 text-[#8C6D2E]" />
          Optimistic Democracy &amp; Appeal Window
        </div>
        {appealWindow === 'open' && (
          <span className="inline-flex items-center gap-1 rounded-[2px] border border-[#B58D3D] bg-[#FBF2DC] px-2 py-0.5 font-ledger-mono text-[10px] font-semibold text-[#6B4E16]">
            <Clock className="h-3 w-3" />
            APPEAL WINDOW OPEN
          </span>
        )}
        {appealWindow === 'appealing' && (
          <span className="inline-flex items-center gap-1 rounded-[2px] border border-[#9C6615] bg-[#FDF3DF] px-2 py-0.5 font-ledger-mono text-[10px] font-semibold text-[#754B0C]">
            <ShieldAlert className="h-3 w-3" />
            APPEAL COMMITTEE ACTIVE
          </span>
        )}
        {appealWindow === 'closed-finalized' && (
          <span className="inline-flex items-center gap-1 rounded-[2px] border border-[#1B5E3F] bg-[#E8F3EC] px-2 py-0.5 font-ledger-mono text-[10px] font-semibold text-[#14472F]">
            <CheckCircle2 className="h-3 w-3" />
            APPEAL WINDOW CLOSED · FINALIZED
          </span>
        )}
      </div>

      {/* 5-node architectural pipeline with connector line */}
      <div className="relative">
        <div
          className="absolute top-3 left-[10%] right-[10%] h-[1px] bg-[#CFC7B5]"
          aria-hidden="true"
        />
        <div className="relative grid grid-cols-5 gap-1.5">
          {STEPS.map((step, idx) => {
            const isFinalError = stage === 'finalized-error' && idx === 4;
            const reached = idx <= activeIdx;
            const isCurrent = idx === activeIdx;

            let nodeClasses = 'border-[#CFC7B5] bg-[#F2ECE0] text-[#78736A]';
            let labelClasses = 'text-[#78736A]';

            if (isFinalError) {
              nodeClasses = 'border-[#9B2226] bg-[#9B2226] text-white';
              labelClasses = 'text-[#7A181B] font-semibold';
            } else if (isCurrent) {
              nodeClasses = 'border-[#111215] bg-[#111215] text-[#F6F2EA] ring-2 ring-[#C89D42]/40';
              labelClasses = 'text-[#141518] font-semibold';
            } else if (reached) {
              nodeClasses = 'border-[#1B5E3F] bg-[#E8F3EC] text-[#14472F]';
              labelClasses = 'text-[#141518]';
            }

            return (
              <div key={step.key} className="flex flex-col items-center text-center">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border font-ledger-mono text-[10px] font-semibold transition-colors ${nodeClasses}`}
                  title={isFinalError ? 'Finalized (Error)' : step.label}
                >
                  {idx + 1}
                </div>
                <span
                  className={`mt-1.5 font-ledger-mono text-[10px] leading-tight truncate max-w-full ${labelClasses}`}
                >
                  <span className="hidden sm:inline">
                    {isFinalError ? 'Finalized (Err)' : step.label}
                  </span>
                  <span className="sm:hidden">
                    {isFinalError ? '05 Err' : step.short}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {appealNote && (
        <p className="mt-2.5 text-[11px] text-[#57544D] leading-relaxed border-t border-[#E6E0D3] pt-2">
          {appealNote}
        </p>
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
              className="rounded-[2px] border border-[#8C6D2E] bg-[#111215] px-2.5 py-1 text-[11px] font-medium text-[#F6F2EA] hover:bg-[#2C2D33] disabled:opacity-50 cursor-pointer"
            >
              {appealingBusy ? 'Submitting Appeal...' : 'Appeal Decision'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
