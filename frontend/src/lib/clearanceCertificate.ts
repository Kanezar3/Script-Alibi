import type { NormalizedProofBundle, ProofCaseRecord } from '../types/scriptAlibi';
import { buildExplorerAddressUrl, buildExplorerTxUrl } from './proofAdapter';

export interface ClearanceCertificatePayload {
  schema: 'script-alibi/clearance-certificate/v1';
  generatedAtUtc: string;
  network: {
    name: string;
    chainId: number;
    rpcUrl: string;
    contractAddress: string;
    contractExplorerUrl: string;
    contractSha256?: string;
  };
  caseDossier: {
    caseId: string;
    caseNumber: number;
    title: string;
    outcome: string;
    rawVerdict: string;
    rationale?: string;
    economicEffect?: string;
    poolId?: number | null;
    claimId?: number | null;
    workTitle?: string;
    elementClause?: string;
    clauseSha256?: string;
    txHash: string;
    txExplorerUrl: string;
  };
  evidence: {
    evidenceUrl?: string;
    startLine?: number | null;
    endLine?: number | null;
    snippetSha256?: string;
    evidenceQuote?: string;
    snippetText?: string;
  };
}

export function sanitizeFilenameSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'clearance-dossier';
}

export function buildClearanceCertificatePayload(
  proof: NormalizedProofBundle,
  record: ProofCaseRecord,
  generatedAtUtc = new Date().toISOString()
): ClearanceCertificatePayload {
  return {
    schema: 'script-alibi/clearance-certificate/v1',
    generatedAtUtc,
    network: {
      name: proof.network,
      chainId: proof.chainId,
      rpcUrl: proof.rpcUrl,
      contractAddress: proof.contractAddress,
      contractExplorerUrl: buildExplorerAddressUrl(
        proof.contractAddress,
        proof.explorerBaseUrl
      ),
      contractSha256: proof.contractSha256,
    },
    caseDossier: {
      caseId: record.caseId,
      caseNumber: record.caseNumber,
      title: record.title,
      outcome: record.outcome,
      rawVerdict: record.rawVerdict,
      rationale: record.rationale,
      economicEffect: record.economicEffect,
      poolId: record.poolId,
      claimId: record.claimId,
      workTitle: record.workTitle,
      elementClause: record.elementClause,
      clauseSha256: record.clauseSha256,
      txHash: record.txHash,
      txExplorerUrl:
        record.explorerTxUrl ||
        buildExplorerTxUrl(record.txHash, proof.explorerBaseUrl),
    },
    evidence: {
      evidenceUrl: record.evidenceUrl,
      startLine: record.startLine,
      endLine: record.endLine,
      snippetSha256: record.snippetSha256,
      evidenceQuote: record.evidenceQuote,
      snippetText: record.snippetText,
    },
  };
}

export function formatClearanceCertificateMarkdown(
  cert: ClearanceCertificatePayload
): string {
  const lines = [
    `# Script Alibi — Chain-of-Title Clearance Certificate`,
    ``,
    `- **Schema:** \`${cert.schema}\``,
    `- **Generated (UTC):** \`${cert.generatedAtUtc}\``,
    `- **Exhibit:** \`EX-${String(cert.caseDossier.caseNumber).padStart(2, '0')}\` (\`${cert.caseDossier.caseId}\`)`,
    `- **Title:** ${cert.caseDossier.title}`,
    `- **Finalized Outcome:** \`${cert.caseDossier.outcome}\` (\`${cert.caseDossier.rawVerdict}\`)`,
    cert.caseDossier.rationale
      ? `- **Rationale:** ${cert.caseDossier.rationale}`
      : null,
    cert.caseDossier.economicEffect
      ? `- **Escrow Settlement:** ${cert.caseDossier.economicEffect}`
      : null,
    ``,
    `## Literary Element Under Review`,
    cert.caseDossier.workTitle
      ? `- **Work Title:** ${cert.caseDossier.workTitle}`
      : null,
    cert.caseDossier.elementClause
      ? `- **Clause:** ${cert.caseDossier.elementClause}`
      : null,
    cert.caseDossier.clauseSha256
      ? `- **Clause SHA-256:** \`${cert.caseDossier.clauseSha256}\``
      : null,
    cert.caseDossier.poolId !== undefined && cert.caseDossier.poolId !== null
      ? `- **On-Chain Pool ID:** \`#${cert.caseDossier.poolId}\``
      : null,
    cert.caseDossier.claimId !== undefined && cert.caseDossier.claimId !== null
      ? `- **On-Chain Claim ID:** \`#${cert.caseDossier.claimId}\``
      : null,
    ``,
    `## Immutable Primary-Source Evidence`,
    cert.evidence.evidenceUrl
      ? `- **Source URL:** ${cert.evidence.evidenceUrl}`
      : `- **Source URL:** _None recorded_`,
    cert.evidence.startLine && cert.evidence.endLine
      ? `- **Line Span:** \`L${cert.evidence.startLine}-L${cert.evidence.endLine}\``
      : null,
    cert.evidence.snippetSha256
      ? `- **Snippet SHA-256:** \`${cert.evidence.snippetSha256}\``
      : null,
    cert.evidence.evidenceQuote
      ? `- **Verified Verbatim Quote:** "${cert.evidence.evidenceQuote}"`
      : null,
    ``,
    `## GenLayer StudioNet Anchors`,
    `- **Network:** ${cert.network.name} (Chain ID \`${cert.network.chainId}\`)`,
    `- **Contract Address:** \`${cert.network.contractAddress}\``,
    `- **Contract Explorer:** ${cert.network.contractExplorerUrl}`,
    cert.network.contractSha256
      ? `- **Contract Source SHA-256:** \`${cert.network.contractSha256}\``
      : null,
    `- **Finalized Tx Hash:** \`${cert.caseDossier.txHash}\``,
    `- **Tx Explorer:** ${cert.caseDossier.txExplorerUrl}`,
  ];

  if (cert.evidence.snippetText) {
    lines.push(
      ``,
      `## Normalized Primary-Text Slice`,
      `\`\`\`text`,
      cert.evidence.snippetText,
      `\`\`\``
    );
  }

  return lines.filter((line) => line !== null).join('\n') + '\n';
}
