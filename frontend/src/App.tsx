import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Activity, Wallet, ExternalLink, Scale } from 'lucide-react';
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
import type { LiveReadSnapshot } from './types/scriptAlibi';
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
        `Submitted ${functionName} (${txHash.slice(0, 14)}...). Polling consensus lifecycle in Lifecycle Monitor.`
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

  return (
    <div className="min-h-screen bg-[#F6F2EA] text-[#141518] flex flex-col">
      {/* Studio Masthead */}
      <header className="border-b border-[#141518] bg-[#FDFBF7]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-ledger-mono uppercase tracking-widest text-[#57544D] pb-3 border-b border-[#DED7C8]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#141518]">
                <Scale className="h-3.5 w-3.5 text-[#8C6D2E]" />
                SCRIPT ALIBI · STUDIO CLEARANCE LEDGER
              </span>
              <span>·</span>
              <span>GENLAYER STUDIONET (CHAIN {proof.chainId})</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {proof.contractAddress ? (
                <a
                  href={buildExplorerAddressUrl(proof.contractAddress, proof.explorerBaseUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#1F4E78] hover:underline"
                >
                  Contract: {proof.contractAddress.slice(0, 10)}...{proof.contractAddress.slice(-6)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-[#9C6615]">Awaiting StudioNet Contract Address</span>
              )}
            </div>
          </div>

          <div className="pt-4 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#141518]">
                Script Alibi Literary Archive
              </h1>
              <p className="mt-1.5 text-sm text-[#57544D] leading-relaxed">
                Public-domain script clearance &amp; plot-alibi oracle. Validators verify verbatim
                passages against commit-pinned literary editions; deterministic Python governs every
                bounty, stake, and refund.
              </p>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('proof')}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-3.5 py-2 text-xs font-semibold tracking-wide cursor-pointer ${
                  activeTab === 'proof'
                    ? 'border-[#141518] bg-[#141518] text-[#FDFBF7]'
                    : 'border-[#CFC7B5] bg-[#FAF7F0] text-[#141518] hover:bg-[#EFEAE0]'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Proof Inspector
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('console')}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-3.5 py-2 text-xs font-semibold tracking-wide cursor-pointer ${
                  activeTab === 'console'
                    ? 'border-[#141518] bg-[#141518] text-[#FDFBF7]'
                    : 'border-[#CFC7B5] bg-[#FAF7F0] text-[#141518] hover:bg-[#EFEAE0]'
                }`}
              >
                <Wallet className="h-3.5 w-3.5" />
                Live Ledger &amp; Wallet
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('lifecycle')}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-3.5 py-2 text-xs font-semibold tracking-wide cursor-pointer ${
                  activeTab === 'lifecycle'
                    ? 'border-[#141518] bg-[#141518] text-[#FDFBF7]'
                    : 'border-[#CFC7B5] bg-[#FAF7F0] text-[#141518] hover:bg-[#EFEAE0]'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                Tx Lifecycle
                {activeTxCount > 0 && (
                  <span className="ml-1 rounded-full bg-[#B58D3D] px-1.5 py-0.2 text-[10px] text-white font-ledger-mono">
                    {activeTxCount}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-7">
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
            transactions={trackedTxs}
            explorerBaseUrl={proof.explorerBaseUrl}
            isPolling={isPollingTxs}
            walletAddress={walletAddress}
            onPollAll={() => void pollActiveTransactions()}
            onAddManualHash={(hash, label) => {
              trackNewTx(hash, 'manual_track', label);
              void pollActiveTransactions();
            }}
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
      <footer className="border-t border-[#DED7C8] bg-[#FAF7F0] py-4 text-xs text-[#57544D]">
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
