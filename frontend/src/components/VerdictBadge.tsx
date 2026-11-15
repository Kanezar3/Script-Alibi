import type { CaseOutcome } from '../types/scriptAlibi';
import type { TxLifecycleStage } from '../lib/txTracker';

const OUTCOME_STYLES: Record<
  CaseOutcome | string,
  { label: string; classes: string }
> = {
  ORIGIN_VERIFIED: {
    label: 'ORIGIN VERIFIED',
    classes: 'border-[#1B5E3F] bg-[#E8F3EC] text-[#14472F]',
  },
  CONTRADICTED_BY_SOURCE: {
    label: 'CONTRADICTED BY SOURCE',
    classes: 'border-[#9B2226] bg-[#FCEAEA] text-[#7A181B]',
  },
  INSUFFICIENT_EVIDENCE: {
    label: 'INSUFFICIENT EVIDENCE',
    classes: 'border-[#9C6615] bg-[#FDF3DF] text-[#754B0C]',
  },
  TOO_VAGUE: {
    label: 'TOO VAGUE · REFUNDED',
    classes: 'border-[#7A181B] bg-[#F8E7E7] text-[#7A181B]',
  },
  CLEARABLE: {
    label: 'CLEARABLE · POOL OPEN',
    classes: 'border-[#1F4E78] bg-[#E9F1F8] text-[#173B5C]',
  },
  PROMPT_INJECTION_DEFENSE: {
    label: 'INJECTION DEFENDED',
    classes: 'border-[#6B4E16] bg-[#F7EED8] text-[#533B0E]',
  },
};

export function VerdictBadge({
  outcome,
  rawVerdict,
}: {
  outcome: CaseOutcome | string;
  rawVerdict?: string;
}) {
  const style = OUTCOME_STYLES[outcome] ?? {
    label: rawVerdict || String(outcome),
    classes: 'border-[#57544D] bg-[#EFEAE0] text-[#141518]',
  };

  return (
    <span
      className={`studio-stamp inline-flex items-center px-2.5 py-0.5 text-[11px] font-semibold font-ledger-mono ${style.classes}`}
    >
      {style.label}
    </span>
  );
}

const LIFECYCLE_STYLES: Record<
  TxLifecycleStage,
  { label: string; dot: string; classes: string }
> = {
  submitted: {
    label: 'SUBMITTED',
    dot: 'bg-[#57544D]',
    classes: 'border-[#C9C1B0] bg-[#F3EFE6] text-[#45423C]',
  },
  pending: {
    label: 'PENDING',
    dot: 'bg-[#9C6615] animate-pulse',
    classes: 'border-[#D9A74A] bg-[#FDF3DF] text-[#754B0C]',
  },
  proposing: {
    label: 'PROPOSING / VALIDATING',
    dot: 'bg-[#1F4E78] animate-pulse',
    classes: 'border-[#6E9BC5] bg-[#E9F1F8] text-[#173B5C]',
  },
  accepted: {
    label: 'ACCEPTED · APPEAL WINDOW',
    dot: 'bg-[#B58D3D] animate-pulse',
    classes: 'border-[#B58D3D] bg-[#FBF2DC] text-[#6B4E16]',
  },
  'finalized-success': {
    label: 'FINALIZED · SUCCESS',
    dot: 'bg-[#1B5E3F]',
    classes: 'border-[#1B5E3F] bg-[#E8F3EC] text-[#14472F]',
  },
  'finalized-error': {
    label: 'FINALIZED · ERROR',
    dot: 'bg-[#9B2226]',
    classes: 'border-[#9B2226] bg-[#FCEAEA] text-[#7A181B]',
  },
};

export function LifecycleBadge({ stage }: { stage: TxLifecycleStage }) {
  const cfg = LIFECYCLE_STYLES[stage] ?? LIFECYCLE_STYLES.submitted;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium font-ledger-mono ${cfg.classes}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
