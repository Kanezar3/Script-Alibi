export type CaseOutcome =
  | 'TOO_VAGUE'
  | 'CLEARABLE'
  | 'ORIGIN_VERIFIED'
  | 'CONTRADICTED_BY_SOURCE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'PROMPT_INJECTION_DEFENSE';

export interface ProofCaseRecord {
  caseId: string;
  caseNumber: number;
  title: string;
  subtitle: string;
  outcome: CaseOutcome;
  rawVerdict: string;
  action: 'create_clearance_pool' | 'submit_alibi_claim' | string;
  txHash: string;
  blockNumber?: number | string | null;
  finalityStatus: string;
  executionResult?: string;
  appealWindowNote?: string;
  poolId?: number | null;
  claimId?: number | null;
  workTitle?: string;
  elementClause?: string;
  clauseSha256?: string;
  evidenceUrl?: string;
  startLine?: number | null;
  endLine?: number | null;
  snippetSha256?: string;
  snippetText?: string;
  evidenceQuote?: string;
  rationale?: string;
  economicEffect?: string;
  explorerTxUrl?: string;
}

export interface NormalizedProofBundle {
  isPlaceholder: boolean;
  network: string;
  chainId: number;
  rpcUrl: string;
  explorerBaseUrl: string;
  contractAddress: string;
  deployerAddress: string;
  runnerHash?: string;
  contractSha256?: string;
  generatedAt?: string;
  cases: ProofCaseRecord[];
  rawProof: Record<string, unknown>;
}

export interface OnChainPool {
  pool_id: number;
  creator: string;
  work_title: string;
  element_clause: string;
  clause_sha256: string;
  bounty_wei: string;
  deadline_ts: number;
  created_ts?: number;
  status: string;
  winning_claim_id?: number | null;
  active_claim_id?: number | null;
  winning_verdict?: string;
  rationale?: string;
}

export interface OnChainClaim {
  claim_id: number;
  pool_id: number;
  claimant: string;
  evidence_url: string;
  start_line: number;
  end_line: number;
  snippet_sha256: string;
  snippet_excerpt?: string;
  verdict: string;
  evidence_quote: string;
  rationale: string;
  stake_wei: string;
  payout_wei?: string;
  created_ts?: number;
  status: string;
}

export interface RejectedSubmission {
  id?: number;
  sender?: string;
  work_title?: string;
  element_clause?: string;
  reason?: string;
  validity?: string;
  refunded_wei?: string;
  created_ts?: number;
  [key: string]: unknown;
}

export interface ProtocolStats {
  total_pools?: number;
  open_pools?: number;
  cleared_pools?: number;
  hazard_pools?: number;
  expired_pools?: number;
  total_claims?: number;
  total_vague_rejections?: number;
  total_locked_wei?: string;
  total_withdrawn_wei?: string;
  [key: string]: unknown;
}

export interface LiveCaseVerification {
  txHash: string;
  statusName: string;
  executionResultName: string;
  lifecycleStage: string;
  appealWindow: string;
  matchesRecordedFinality: boolean;
  matchesOnChainState: boolean | null;
  onChainDetail?: string;
  error?: string;
  checkedAt: number;
}

export interface LiveReadSnapshot {
  fetchedAt: number;
  rpcUrl: string;
  contractAddress: string;
  pools: OnChainPool[];
  claims: OnChainClaim[];
  rejectedSubmissions: RejectedSubmission[];
  stats: ProtocolStats | null;
  txVerifications: Record<string, LiveCaseVerification>;
  error?: string;
}
