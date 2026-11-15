import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import type {
  LiveCaseVerification,
  LiveReadSnapshot,
  NormalizedProofBundle,
  OnChainClaim,
  OnChainPool,
  ProtocolStats,
  RejectedSubmission,
} from '../types/scriptAlibi';
import { STUDIONET_CHAIN_ID, STUDIONET_EXPLORER_URL, STUDIONET_RPC_URL } from './proofAdapter';
import { mapGenLayerStatusToLifecycle } from './txTracker';

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

function createReadClient(rpcUrl = STUDIONET_RPC_URL) {
  return createClient({
    chain: studionet,
    endpoint: rpcUrl,
  });
}

function createBrowserWriteClient(walletAddress: string, rpcUrl = STUDIONET_RPC_URL) {
  if (!window.ethereum) {
    throw new Error('No injected EIP-1193 wallet (MetaMask) found in this browser.');
  }
  return createClient({
    chain: studionet,
    endpoint: rpcUrl,
    account: walletAddress as `0x${string}`,
    provider: window.ethereum as never,
  });
}

export function unwrapViewResult<T>(raw: unknown): T {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return raw as T;
      }
    }
  }
  return raw as T;
}

async function safeReadView<T>(
  contractAddress: string,
  functionName: string,
  args: (string | number | boolean | bigint)[] = [],
  rpcUrl = STUDIONET_RPC_URL
): Promise<T> {
  const client = createReadClient(rpcUrl);
  try {
    const res = await client.readContract({
      address: contractAddress as `0x${string}`,
      functionName,
      args,
      jsonSafeReturn: true,
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    });
    return unwrapViewResult<T>(res);
  } catch {
    const fallback = await client.readContract({
      address: contractAddress as `0x${string}`,
      functionName,
      args,
      jsonSafeReturn: true,
      transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
    });
    return unwrapViewResult<T>(fallback);
  }
}

export async function fetchTransactionLifecycle(
  txHash: string,
  rpcUrl = STUDIONET_RPC_URL
) {
  const client = createReadClient(rpcUrl);
  const tx = await client.getTransaction({
    hash: txHash as `0x${string}` & { length: 66 },
  });
  const statusName = String(tx.statusName ?? tx.status ?? 'UNKNOWN');
  const executionResultName = String(tx.txExecutionResultName ?? tx.resultName ?? '');
  const { stage, appealWindow } = mapGenLayerStatusToLifecycle(
    statusName,
    executionResultName
  );
  return {
    tx,
    statusName,
    executionResultName,
    stage,
    appealWindow,
  };
}

export async function fetchLiveContractSnapshot(
  contractAddress: string,
  proof?: NormalizedProofBundle,
  rpcUrl = STUDIONET_RPC_URL
): Promise<LiveReadSnapshot> {
  if (!contractAddress) {
    return {
      fetchedAt: Date.now(),
      rpcUrl,
      contractAddress: '',
      pools: [],
      claims: [],
      rejectedSubmissions: [],
      stats: null,
      txVerifications: {},
      error: 'Contract address is not configured yet.',
    };
  }

  try {
    const [poolsRes, claimsRes, statsRes, rejectedRes] = await Promise.allSettled([
      safeReadView<OnChainPool[]>(contractAddress, 'get_all_pools', [], rpcUrl),
      safeReadView<OnChainClaim[]>(contractAddress, 'get_all_claims', [], rpcUrl),
      safeReadView<ProtocolStats>(contractAddress, 'get_protocol_stats', [], rpcUrl),
      safeReadView<RejectedSubmission[]>(contractAddress, 'get_rejected_submissions', [], rpcUrl),
    ]);

    const pools =
      poolsRes.status === 'fulfilled' && Array.isArray(poolsRes.value)
        ? poolsRes.value
        : [];
    const claims =
      claimsRes.status === 'fulfilled' && Array.isArray(claimsRes.value)
        ? claimsRes.value
        : [];
    const stats =
      statsRes.status === 'fulfilled' &&
      statsRes.value &&
      typeof statsRes.value === 'object'
        ? statsRes.value
        : null;
    const rejectedSubmissions =
      rejectedRes.status === 'fulfilled' && Array.isArray(rejectedRes.value)
        ? rejectedRes.value
        : [];

    const txVerifications: Record<string, LiveCaseVerification> = {};
    if (proof && proof.cases.length > 0) {
      const uniqueHashes = Array.from(
        new Set(proof.cases.map((c) => c.txHash).filter((h) => /^0x[0-9a-fA-F]{64}$/.test(h)))
      );

      const txResults = await Promise.allSettled(
        uniqueHashes.map(async (txHash) => {
          const info = await fetchTransactionLifecycle(txHash, rpcUrl);
          return { txHash, info };
        })
      );

      for (let i = 0; i < uniqueHashes.length; i++) {
        const txHash = uniqueHashes[i];
        const settled = txResults[i];
        const matchingCase = proof.cases.find((c) => c.txHash === txHash);

        if (settled.status === 'fulfilled') {
          const { statusName, executionResultName, stage, appealWindow } =
            settled.value.info;
          const isFinalized = statusName.toUpperCase() === 'FINALIZED' || statusName === '7';
          const isSuccessExec =
            !executionResultName ||
            executionResultName.toUpperCase().includes('RETURN') ||
            executionResultName.toUpperCase().includes('SUCCESS');

          let onChainDetail: string | undefined;
          let matchesOnChainState: boolean | null = null;
          if (matchingCase?.claimId != null) {
            const liveClaim = claims.find((cl) => Number(cl.claim_id) === matchingCase.claimId);
            if (liveClaim) {
              matchesOnChainState =
                String(liveClaim.verdict).toUpperCase() ===
                String(matchingCase.rawVerdict).toUpperCase();
              onChainDetail = `Live Claim #${liveClaim.claim_id}: ${liveClaim.verdict} (${liveClaim.status})`;
            }
          } else if (matchingCase?.poolId != null) {
            const livePool = pools.find((pl) => Number(pl.pool_id) === matchingCase.poolId);
            if (livePool) {
              matchesOnChainState = true;
              onChainDetail = `Live Pool #${livePool.pool_id}: ${livePool.status}`;
            }
          }

          txVerifications[txHash] = {
            txHash,
            statusName,
            executionResultName,
            lifecycleStage: stage,
            appealWindow,
            matchesRecordedFinality: isFinalized && isSuccessExec,
            matchesOnChainState,
            onChainDetail,
            checkedAt: Date.now(),
          };
        } else {
          txVerifications[txHash] = {
            txHash,
            statusName: 'UNREACHABLE',
            executionResultName: '',
            lifecycleStage: 'submitted',
            appealWindow: 'unknown',
            matchesRecordedFinality: false,
            matchesOnChainState: null,
            error:
              settled.reason instanceof Error
                ? settled.reason.message
                : String(settled.reason),
            checkedAt: Date.now(),
          };
        }
      }
    }

    const firstViewError =
      poolsRes.status === 'rejected'
        ? poolsRes.reason instanceof Error
          ? poolsRes.reason.message
          : String(poolsRes.reason)
        : undefined;

    return {
      fetchedAt: Date.now(),
      rpcUrl,
      contractAddress,
      pools,
      claims,
      rejectedSubmissions,
      stats,
      txVerifications,
      error: pools.length === 0 && claims.length === 0 ? firstViewError : undefined,
    };
  } catch (err) {
    return {
      fetchedAt: Date.now(),
      rpcUrl,
      contractAddress,
      pools: [],
      claims: [],
      rejectedSubmissions: [],
      stats: null,
      txVerifications: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchRefundableBalance(
  contractAddress: string,
  accountAddress: string,
  rpcUrl = STUDIONET_RPC_URL
): Promise<string> {
  if (!contractAddress || !accountAddress) return '0';
  const res = await safeReadView<string | number | bigint>(
    contractAddress,
    'get_refundable_balance',
    [accountAddress],
    rpcUrl
  );
  return String(res ?? '0');
}

export async function connectBrowserWallet(): Promise<{
  address: string;
  chainId: number | null;
}> {
  if (!window.ethereum) {
    throw new Error('MetaMask / injected EIP-1193 wallet not detected.');
  }
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error('No wallet account authorized.');
  }
  const chainHex = (await window.ethereum.request({
    method: 'eth_chainId',
  })) as string;
  const chainId = chainHex ? parseInt(chainHex, 16) : null;
  return { address: accounts[0], chainId };
}

export async function switchOrAddStudioNet(): Promise<number> {
  if (!window.ethereum) {
    throw new Error('MetaMask / injected EIP-1193 wallet not detected.');
  }
  const chainIdHex = `0x${STUDIONET_CHAIN_ID.toString(16)}`;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902 || String((err as Error)?.message ?? '').includes('Unrecognized chain')) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainIdHex,
            chainName: 'GenLayer StudioNet',
            rpcUrls: [STUDIONET_RPC_URL],
            nativeCurrency: {
              name: 'GEN Token',
              symbol: 'GEN',
              decimals: 18,
            },
            blockExplorerUrls: [STUDIONET_EXPLORER_URL],
          },
        ],
      });
    } else {
      throw err;
    }
  }
  return STUDIONET_CHAIN_ID;
}

export async function writeContractMethod(params: {
  contractAddress: string;
  walletAddress: string;
  functionName: string;
  args: (string | number | boolean | bigint)[];
  valueWei?: bigint;
  rpcUrl?: string;
}): Promise<string> {
  const client = createBrowserWriteClient(params.walletAddress, params.rpcUrl);
  const txHash = await client.writeContract({
    address: params.contractAddress as `0x${string}`,
    functionName: params.functionName,
    args: params.args,
    value: params.valueWei ?? 0n,
  });
  return String(txHash);
}

export async function submitTransactionAppeal(params: {
  walletAddress: string;
  txHash: string;
  rpcUrl?: string;
}): Promise<string> {
  const client = createBrowserWriteClient(params.walletAddress, params.rpcUrl);
  const res = await client.appealTransaction({
    txId: params.txHash as `0x${string}`,
    value: 0n,
  });
  return String(res ?? params.txHash);
}
