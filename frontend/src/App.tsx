import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Scale } from 'lucide-react';
import rawProofJson from './data/proof.json';
import {
  buildExplorerAddressUrl,
  normalizeProofBundle,
  STUDIONET_CHAIN_ID,
} from './lib/proofAdapter';
import {
  connectBrowserWallet,
  fetchLiveContractSnapshot,
  fetchRefundableBalance,
  fetchTransactionLifecycle,
  submitTransactionAppeal,
  switchOrAddStudioNet,
  writeContractMethod,
} from './lib/genlayerClient';
import {
  isTerminalLifecycleStage,
  loadTrackedTransactions,
  saveTrackedTransactions,
  upsertTrackedTransaction,
  type TrackedTransaction,
} from './lib/txTracker';
import { truncateMiddle } from './lib/validation';
import type { LiveReadSnapshot, ProtocolStats } from './types/scriptAlibi';
import { ProofInspector } from './components/ProofInspector';
import { LiveWalletConsole } from './components/LiveWalletConsole';
import { TxLifecycleMonitor } from './components/TxLifecycleMonitor';

type TabId = 'proof' | 'console' | 'lifecycle';

export function App() {
  const proof = useMemo(() => normalizeProofBundle(rawProofJson), []);
  const [activeTab, setActiveTab] = useState<TabId>('proof');
  const [contractOverride, setContractOverride] = useState('');
  const effectiveContract = contractOverride.trim() || proof.contractAddress;

  // Live StudioNet state
  const [liveSnapshot, setLiveSnapshot] = useState<LiveReadSnapshot | null>(null);
  const [isVerifyingLive, setIsVerifyingLive] = useState(false);

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [refundableWei, setRefundableWei] = useState<string>('0');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // LocalStorage-persisted resumable tx tracker
  const [trackedTxs, setTrackedTxs] = useState<TrackedTransaction[]>(() =>
    loadTrackedTransactions()
  );
  const [isPollingTxs, setIsPollingTxs] = useState(false);
  const [appealingHash, setAppealingHash] = useState<string | null>(null);
  const didAutoVerifyRef = useRef(false);

  const handleVerifyLive = useCallback(async () => {
    if (!effectiveContract) return;
    setIsVerifyingLive(true);
    try {
      const snapshot = await fetchLiveContractSnapshot(
        effectiveContract,
        proof,
        proof.rpcUrl
      );
      setLiveSnapshot(snapshot);
      if (walletAddress) {
        const bal = await fetchRefundableBalance(
          effectiveContract,
          walletAddress,
          proof.rpcUrl
        ).catch(() => '0');
        setRefundableWei(bal);
      }
    } finally {
      setIsVerifyingLive(false);
    }
  }, [effectiveContract, proof, walletAddress]);

  // Once-per-mount automatic StudioNet RPC verification
  useEffect(() => {
    if (didAutoVerifyRef.current) return;
    if (!proof.isPlaceholder && effectiveContract) {
      didAutoVerifyRef.current = true;
      void handleVerifyLive();
    }
  }, [proof.isPlaceholder, effectiveContract, handleVerifyLive]);

  // Listen for MetaMask account/network changes
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on) return;
    const onAccountsChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      setWalletAddress(list[0] ?? null);
    };
    const onChainChanged = (chainHex: unknown) => {
      if (typeof chainHex === 'string') {
        setWalletChainId(parseInt(chainHex, 16));
      }
    };
    eth.on('accountsChanged', onAccountsChanged);
    eth.on('chainChanged', onChainChanged);
    return () => {
      eth.removeListener?.('accountsChanged', onAccountsChanged);
      eth.removeListener?.('chainChanged', onChainChanged);
    };
  }, []);

  // Poll refundable balance whenever wallet connects & contract exists
  useEffect(() => {
    if (!walletAddress || !effectiveContract) return;
    void fetchRefundableBalance(effectiveContract, walletAddress, proof.rpcUrl)
      .then(setRefundableWei)
      .catch(() => {});
  }, [walletAddress, effectiveContract, proof.rpcUrl]);

  // Resumable polling for non-terminal tracked transactions (8s interval per StudioNet limits)
  const pollActiveTransactions = useCallback(async () => {
    const current = loadTrackedTransactions();
    const pending = current.filter((t) => !isTerminalLifecycleStage(t.stage));
    if (pending.length === 0) return;

    setIsPollingTxs(true);
    try {
      let updatedList = current;
      for (const tx of pending) {
        try {
          const info = await fetchTransactionLifecycle(tx.hash, proof.rpcUrl);
          updatedList = upsertTrackedTransaction({
            ...tx,
            stage: info.stage,
            appealWindow: info.appealWindow,
            rawStatusName: info.statusName,
            executionResultName: info.executionResultName,
            updatedAt: Date.now(),
          });
        } catch (err) {
          updatedList = upsertTrackedTransaction({
            ...tx,
            errorMessage: err instanceof Error ? err.message : String(err),
            updatedAt: Date.now(),
          });
        }
      }
      setTrackedTxs(updatedList);
    } finally {
      setIsPollingTxs(false);
    }
  }, [proof.rpcUrl]);

  useEffect(() => {
    const hasActive = trackedTxs.some((t) => !isTerminalLifecycleStage(t.stage));
    if (!hasActive) return;

    // Immediate resume poll on mount/reload, then every 8s
    void pollActiveTransactions();
    const timer = window.setInterval(() => {
      void pollActiveTransactions();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [trackedTxs.length, pollActiveTransactions]);

  const trackNewTx = (hash: string, action: string, label: string) => {
    const next = upsertTrackedTransaction({
      hash,
      action,
      label,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stage: 'submitted',
      appealWindow: 'not-reached',
      contractAddress: effectiveContract,
    });
    setTrackedTxs(next);
  };

  const handleLoadRecordedTxs = (
    items: { hash: string; action: string; label: string }[]
  ) => {
    const existing = loadTrackedTransactions();
    const existingHashes = new Set(existing.map((t) => t.hash.toLowerCase()));
    const toAdd = items.filter((item) => !existingHashes.has(item.hash.toLowerCase()));
    if (toAdd.length === 0) return;

    const now = Date.now();
    const newEntries: TrackedTransaction[] = toAdd.map((item) => ({
      hash: item.hash,
      action: item.action,
      label: item.label,
      createdAt: now,
      updatedAt: now,
      stage: 'submitted',
      appealWindow: 'not-reached',
      contractAddress: effectiveContract,
    }));

    const merged = [...newEntries, ...existing].slice(0, 40);
    saveTrackedTransactions(merged);
    setTrackedTxs(merged);
    void pollActiveTransactions();
  };

  const handleConnectWallet = async () => {
    setActionError(null);
    setActionNotice(null);
    try {
      const { address, chainId } = await connectBrowserWallet();
      setWalletAddress(address);
      setWalletChainId(chainId);
      if (chainId !== STUDIONET_CHAIN_ID) {
        try {
          const switched = await switchOrAddStudioNet();
          setWalletChainId(switched);
        } catch {
          setActionNotice(
            `Wallet connected (${address.slice(0, 8)}...). Switch to GenLayer StudioNet (${STUDIONET_CHAIN_ID}) before submitting transactions.`
          );
          return;
        }
      }
      setActionNotice(`Connected ${address} on GenLayer StudioNet (61999).`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSwitchStudioNet = async () => {
    setActionError(null);
    try {
      const switched = await switchOrAddStudioNet();
      setWalletChainId(switched);
      setActionNotice('Switched wallet to GenLayer StudioNet (Chain ID 61999).');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const ensureReadyForWrite = async () => {
    if (!walletAddress) throw new Error('Connect your wallet first.');
    if (!effectiveContract) throw new Error('Contract address is not set.');
    if (walletChainId !== STUDIONET_CHAIN_ID) {
      await switchOrAddStudioNet();
      setWalletChainId(STUDIONET_CHAIN_ID);
    }
  };

  const runWriteAction = async (
    actionKey: string,
    label: string,
    functionName: string,
    args: (string | number | boolean | bigint)[],
    valueWei = 0n
  ) => {
    setActionError(null);
    setActionNotice(null);
    setBusyAction(actionKey);
    try {
      await ensureReadyForWrite();
      const txHash = await writeContractMethod({
        contractAddress: effectiveContract,
        walletAddress: walletAddress!,
        functionName,
        args,
        valueWei,
        rpcUrl: proof.rpcUrl,
      });
      trackNewTx(txHash, functionName, label);
      setActionNotice(
        `Submitted ${functionName} (${txHash.slice(0, 14)}...). Polling consensus lifecycle in Consensus Telemetry.`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleAppealTx = async (txHash: string) => {
    if (!walletAddress) {
      setActionError('Connect your wallet to submit an appeal transaction.');
      return;
    }
    setAppealingHash(txHash);
    setActionError(null);
    try {
      await ensureReadyForWrite();
      await submitTransactionAppeal({
        walletAddress,
        txHash,
        rpcUrl: proof.rpcUrl,
      });
      const current = loadTrackedTransactions();
      const existing = current.find((t) => t.hash === txHash);
      if (existing) {
        setTrackedTxs(
          upsertTrackedTransaction({
            ...existing,
            appealed: true,
            appealWindow: 'appealing',
          })
        );
      }
      setActionNotice(`Appeal submitted for ${txHash.slice(0, 14)}...`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setAppealingHash(null);
    }
  };

  const activeTxCount = trackedTxs.filter((t) => !isTerminalLifecycleStage(t.stage)).length;

  const txCasesCount = proof.cases.filter((c) => Boolean(c.txHash)).length;
  const verifiedCount = proof.cases.filter(
    (c) => c.txHash && liveSnapshot?.txVerifications[c.txHash]?.matchesRecordedFinality
  ).length;

  const recordedStats = (proof.rawProof?.protocol_stats ?? null) as ProtocolStats | null;
  const displayStats = liveSnapshot?.stats ?? recordedStats;
  const poolsCount = displayStats?.total_pools ?? liveSnapshot?.pools.length ?? 0;
  const claimsCount = displayStats?.total_claims ?? liveSnapshot?.claims.length ?? 0;
  const vagueCount = displayStats?.total_vague_rejections ?? 0;

  const rpcDotClass = isVerifyingLive
    ? 'bg-[#D4AF37] animate-pulse'
    : liveSnapshot?.error
      ? 'bg-[#D9534F]'
      : liveSnapshot
        ? 'bg-[#3FB97A]'
        : 'bg-[#8E897F]';

  const rpcStatusText = isVerifyingLive
    ? 'VERIFYING RPC'
    : liveSnapshot?.error
      ? 'RPC ERROR'
      : liveSnapshot
        ? 'LIVE SYNCED'
        : 'RECORDED';

  return (
    <div className="min-h-screen bg-[#F6F2EA] text-[#141518] flex flex-col">
      {/* Obsidian Ink Masthead & Live Telemetry Command Bar */}
      <header className="bg-[#111215] text-[#F6F2EA] border-b border-[#2C2D33]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* Top Edition & Live Telemetry Command Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-[#26282E] font-ledger-mono text-[10px] uppercase tracking-widest">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#D4AF37]">
                <Scale className="h-3.5 w-3.5 text-[#C89D42]" />
                SCRIPT ALIBI // FOLIO N° {proof.chainId} · GENLAYER STUDIONET
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-[#D5CFC2]">
                <span className={`h-1.5 w-1.5 rounded-full ${rpcDotClass}`} />
                <span>{rpcStatusText}</span>
              </span>

              {effectiveContract ? (
                <a
                  href={buildExplorerAddressUrl(effectiveContract, proof.explorerBaseUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#C89D42] hover:text-[#E7C675] hover:underline"
                >
                  Contract {truncateMiddle(effectiveContract, 6, 4)}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : (
                <span className="text-[#C89D42]">Awaiting Contract</span>
              )}

              <span className="text-[#A8A397]">{proof.cases.length} Finalized Exhibits</span>

              {liveSnapshot && !liveSnapshot.error && (
                <span className="text-[#3FB97A]">
                  {verifiedCount}/{txCasesCount} RPC Match
                </span>
              )}

              <span className="text-[#A8A397]">
                Pools {poolsCount} · Claims {claimsCount} · Vague {vagueCount}
              </span>

              <button
                type="button"
                onClick={() => void handleVerifyLive()}
                disabled={isVerifyingLive || !effectiveContract}
                className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#C89D42]/60 bg-[#1B1D22] px-2.5 py-1 text-[10px] font-semibold text-[#F6F2EA] hover:border-[#D4AF37] hover:bg-[#252830] disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 text-[#D4AF37] ${isVerifyingLive ? 'animate-spin' : ''}`} />
                {isVerifyingLive ? 'Verifying...' : 'Verify Live StudioNet'}
              </button>
            </div>
          </div>

          {/* Masthead Title & Architectural Section Tabs */}
          <div className="py-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F6F2EA]">
                Script Alibi Archival Clearance Folio
              </h1>
              <p className="mt-1 text-xs text-[#B6B0A4]">
                Public-domain script clearance &amp; plot-alibi oracle — &ldquo;The model judges;
                plain Python moves money.&rdquo;
              </p>
            </div>

            <nav className="flex flex-wrap gap-1.5" aria-label="Primary Sections">
              <button
                type="button"
                onClick={() => setActiveTab('proof')}
                className={`rounded-[2px] border px-3.5 py-2 font-ledger-mono text-[11px] font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
                  activeTab === 'proof'
                    ? 'border-[#D4AF37] bg-[#F6F2EA] text-[#111215]'
                    : 'border-[#2E3038] bg-[#181A1F] text-[#D5CFC2] hover:border-[#C89D42]/60 hover:text-[#F6F2EA]'
                }`}
              >
                § 01 Dossier &amp; Proof
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('console')}
                className={`rounded-[2px] border px-3.5 py-2 font-ledger-mono text-[11px] font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
                  activeTab === 'console'
                    ? 'border-[#D4AF37] bg-[#F6F2EA] text-[#111215]'
                    : 'border-[#2E3038] bg-[#181A1F] text-[#D5CFC2] hover:border-[#C89D42]/60 hover:text-[#F6F2EA]'
                }`}
              >
                § 02 Clearance Desk &amp; Wallet
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('lifecycle')}
                className={`inline-flex items-center gap-1.5 rounded-[2px] border px-3.5 py-2 font-ledger-mono text-[11px] font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
                  activeTab === 'lifecycle'
                    ? 'border-[#D4AF37] bg-[#F6F2EA] text-[#111215]'
                    : 'border-[#2E3038] bg-[#181A1F] text-[#D5CFC2] hover:border-[#C89D42]/60 hover:text-[#F6F2EA]'
                }`}
              >
                <span>§ 03 Consensus Telemetry</span>
                {activeTxCount > 0 && (
                  <span className="rounded-[2px] bg-[#C89D42] px-1.5 py-0.5 text-[10px] text-[#111215]">
                    {activeTxCount}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content on Archival Paper */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-6">
        {activeTab === 'proof' && (
          <ProofInspector
            proof={proof}
            liveSnapshot={liveSnapshot}
            isVerifyingLive={isVerifyingLive}
            onVerifyLive={() => void handleVerifyLive()}
          />
        )}

        {activeTab === 'console' && (
          <LiveWalletConsole
            proof={proof}
            effectiveContract={effectiveContract}
            contractOverride={contractOverride}
            onContractOverrideChange={setContractOverride}
            liveSnapshot={liveSnapshot}
            walletAddress={walletAddress}
            walletChainId={walletChainId}
            refundableWei={refundableWei}
            isRefreshing={isVerifyingLive}
            busyAction={busyAction}
            actionNotice={actionNotice}
            actionError={actionError}
            handlers={{
              onConnectWallet: handleConnectWallet,
              onSwitchToStudioNet: handleSwitchStudioNet,
              onRefreshLive: handleVerifyLive,
              onCreatePool: async ({ workTitle, elementClause, deadlineTs, valueWei }) => {
                await runWriteAction(
                  'create_clearance_pool',
                  `Create Pool: ${workTitle}`,
                  'create_clearance_pool',
                  [workTitle, elementClause, deadlineTs],
                  valueWei
                );
              },
              onSubmitClaim: async ({ poolId, evidenceUrl, startLine, endLine, valueWei }) => {
                await runWriteAction(
                  'submit_alibi_claim',
                  `Alibi Claim on Pool #${poolId}`,
                  'submit_alibi_claim',
                  [poolId, evidenceUrl, startLine, endLine],
                  valueWei
                );
              },
              onResolveStuckClaim: async (claimId) => {
                await runWriteAction(
                  `resolve_stuck_claim_${claimId}`,
                  `Resolve Stuck Claim #${claimId}`,
                  'resolve_stuck_claim',
                  [claimId],
                  0n
                );
              },
              onSettleExpiredPool: async (poolId) => {
                await runWriteAction(
                  `settle_expired_pool_${poolId}`,
                  `Settle Expired Pool #${poolId}`,
                  'settle_expired_pool',
                  [poolId],
                  0n
                );
              },
              onWithdrawRefundable: async () => {
                await runWriteAction(
                  'withdraw_refundable',
                  'Withdraw Refundable Balance',
                  'withdraw_refundable',
                  [],
                  0n
                );
              },
            }}
          />
        )}

        {activeTab === 'lifecycle' && (
          <TxLifecycleMonitor
            proof={proof}
            transactions={trackedTxs}
            explorerBaseUrl={proof.explorerBaseUrl}
            isPolling={isPollingTxs}
            walletAddress={walletAddress}
            onPollAll={() => void pollActiveTransactions()}
            onAddManualHash={(hash, label) => {
              trackNewTx(hash, 'manual_track', label);
              void pollActiveTransactions();
            }}
            onLoadRecordedTxs={handleLoadRecordedTxs}
            onRemoveTx={(hash) => {
              const filtered = trackedTxs.filter(
                (t) => t.hash.toLowerCase() !== hash.toLowerCase()
              );
              saveTrackedTransactions(filtered);
              setTrackedTxs(filtered);
            }}
            onClearFinalized={() => {
              const activeOnly = trackedTxs.filter((t) => !isTerminalLifecycleStage(t.stage));
              saveTrackedTransactions(activeOnly);
              setTrackedTxs(activeOnly);
            }}
            onAppealTx={(hash) => void handleAppealTx(hash)}
            appealingHash={appealingHash}
          />
        )}
      </main>

      {/* Editorial Footer */}
      <footer className="border-t border-[#DED7C8] bg-[#FAF7F0] py-3.5 text-xs text-[#57544D]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2">
          <span>
            Script Alibi · &ldquo;The model judges; plain Python moves money.&rdquo;
          </span>
          <span className="font-ledger-mono text-[11px]">
            RPC: {proof.rpcUrl} · Chain ID: {proof.chainId}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
