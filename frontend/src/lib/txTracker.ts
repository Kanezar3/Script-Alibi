export type TxLifecycleStage =
  | 'submitted'
  | 'pending'
  | 'proposing'
  | 'accepted'
  | 'finalized-success'
  | 'finalized-error';

export type AppealWindowState =
  | 'not-reached'
  | 'open'
  | 'appealing'
  | 'closed-finalized'
  | 'unknown';

export interface TrackedTransaction {
  hash: string;
  action: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  stage: TxLifecycleStage;
  rawStatusName?: string;
  executionResultName?: string;
  appealWindow: AppealWindowState;
  appealed?: boolean;
  errorMessage?: string;
  contractAddress?: string;
}

const STORAGE_KEY = 'script_alibi_tracked_txs_v1';

export function mapGenLayerStatusToLifecycle(
  statusName?: string | number | null,
  executionResultName?: string | null,
  appealed?: boolean
): { stage: TxLifecycleStage; appealWindow: AppealWindowState } {
  const raw = String(statusName ?? '').toUpperCase().trim();
  const execResult = String(executionResultName ?? '').toUpperCase().trim();

  const isErrorResult =
    execResult.includes('ERROR') ||
    execResult.includes('FAIL') ||
    execResult.includes('REVERT') ||
    raw === 'CANCELED' ||
    raw === 'UNDETERMINED';

  // Numeric GenLayer consensus codes fallback:
  // 0 Uninitialized, 1 Pending, 2 Proposing, 3 Committing, 4 Revealing,
  // 5 Accepted, 6 Undetermined, 7 Finalized, 8 Canceled, 9-10 Appeal, 11-12 Timeout
  if (raw === '7' || raw === 'FINALIZED') {
    return {
      stage: isErrorResult ? 'finalized-error' : 'finalized-success',
      appealWindow: 'closed-finalized',
    };
  }
  if (raw === '8' || raw === 'CANCELED') {
    return {
      stage: 'finalized-error',
      appealWindow: 'closed-finalized',
    };
  }
  if (raw === '5' || raw === 'ACCEPTED' || raw === '11' || raw === '12' || raw.includes('TIMEOUT')) {
    return {
      stage: 'accepted',
      appealWindow: appealed ? 'appealing' : 'open',
    };
  }
  if (raw === '9' || raw === '10' || raw.includes('APPEAL')) {
    return {
      stage: 'accepted',
      appealWindow: 'appealing',
    };
  }
  if (
    raw === '2' ||
    raw === '3' ||
    raw === '4' ||
    raw === 'PROPOSING' ||
    raw === 'COMMITTING' ||
    raw === 'REVEALING' ||
    raw === 'ACTIVATED'
  ) {
    return {
      stage: 'proposing',
      appealWindow: 'not-reached',
    };
  }
  if (raw === '1' || raw === 'PENDING' || raw === '0' || raw === 'UNINITIALIZED') {
    return {
      stage: 'pending',
      appealWindow: 'not-reached',
    };
  }

  return {
    stage: 'submitted',
    appealWindow: 'not-reached',
  };
}

export function loadTrackedTransactions(): TrackedTransaction[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TrackedTransaction =>
        Boolean(item && typeof item.hash === 'string' && typeof item.stage === 'string')
    );
  } catch {
    return [];
  }
}

export function saveTrackedTransactions(items: TrackedTransaction[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 40)));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function upsertTrackedTransaction(tx: TrackedTransaction): TrackedTransaction[] {
  const existing = loadTrackedTransactions();
  const idx = existing.findIndex(
    (item) => item.hash.toLowerCase() === tx.hash.toLowerCase()
  );
  const next = [...existing];
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...tx, updatedAt: Date.now() };
  } else {
    next.unshift(tx);
  }
  saveTrackedTransactions(next);
  return next;
}

export function isTerminalLifecycleStage(stage: TxLifecycleStage): boolean {
  return stage === 'finalized-success' || stage === 'finalized-error';
}
