"""Read-only StudioNet RPC verifier for ScriptAlibi deploy/proof.json.

Verifies:
1. Local contracts/script_alibi.py SHA-256 matches proof.json contract_source_sha256.
2. Deploy tx and every case tx exist on StudioNet RPC and reached FINALIZED status.
3. On-chain read_contract state (get_protocol_stats, get_all_pools, get_all_claims,
   get_rejected_submissions) matches every recorded case outcome, snippet_sha256,
   clause_sha256, and verbatim evidence_quote.
"""

import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

import requests
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.exceptions import GenLayerError
from genlayer_py.provider import GenLayerProvider

ROOT_DIR = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT_DIR / "contracts" / "script_alibi.py"
PROOF_PATH = ROOT_DIR / "deploy" / "proof.json"

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def patch_provider_user_agent() -> None:
    def _make_request(self, method, params):
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": method,
            "params": params,
        }
        for attempt in range(4):
            try:
                response = requests.post(
                    self.url,
                    json=payload,
                    headers={"Content-Type": "application/json", "User-Agent": BROWSER_UA},
                    timeout=30,
                )
            except requests.exceptions.RequestException as err:
                if attempt == 3:
                    raise GenLayerError(f"Request to {self.url} failed: {err}") from err
                time.sleep(3 * (attempt + 1))
                continue

            if response.status_code == 429:
                time.sleep(10 * (attempt + 1))
                continue

            try:
                resp = response.json()
            except ValueError as err:
                if attempt < 3:
                    time.sleep(3 * (attempt + 1))
                    continue
                raise GenLayerError(f"{method} returned invalid JSON: {err}") from err

            self._raise_on_error(resp, method)
            return resp
        raise GenLayerError(f"{method} failed after retries")

    GenLayerProvider.make_request = _make_request


def unwrap_json(val: Any) -> Any:
    if isinstance(val, str):
        return json.loads(val)
    return val


def check_tx_finalized(client, tx_hash: str, label: str) -> None:
    tx = client.get_transaction(transaction_hash=tx_hash)
    status_raw = tx.get("status")
    status_str = str(tx.get("status_name") or status_raw or "").upper()
    if "FINALIZED" not in status_str and status_raw != 7:
        raise AssertionError(
            f"Tx [{label}] {tx_hash} is not FINALIZED (status={status_raw}, status_name={tx.get('status_name')})"
        )
    lr = (tx.get("consensus_data") or {}).get("leader_receipt") or []
    if not lr or lr[0].get("execution_result") != "SUCCESS":
        raise AssertionError(
            f"Tx [{label}] {tx_hash} execution_result != SUCCESS: {lr[0].get('execution_result') if lr else None}"
        )
    print(f"  [OK] {label}: {tx_hash} ({status_str or status_raw}, SUCCESS)")


def main() -> int:
    if not PROOF_PATH.exists():
        print(f"ERROR: {PROOF_PATH} not found", file=sys.stderr)
        return 1

    proof = json.loads(PROOF_PATH.read_text(encoding="utf-8"))
    source_bytes = CONTRACT_PATH.read_bytes()
    actual_sha256 = hashlib.sha256(source_bytes).hexdigest()
    expected_sha256 = proof.get("contract_source_sha256")
    if actual_sha256 != expected_sha256:
        print(
            f"ERROR: Source SHA-256 mismatch: local={actual_sha256} proof={expected_sha256}",
            file=sys.stderr,
        )
        return 1
    print(f"[OK] Contract source SHA-256 matches: {actual_sha256}")

    rpc_url = proof["network"]["rpc_url"]
    contract_addr = proof["contract_address"]
    patch_provider_user_agent()
    client = create_client(chain=studionet, endpoint=rpc_url, account=create_account())

    print(f"Verifying transactions on {rpc_url} for contract {contract_addr}...")
    check_tx_finalized(client, proof["deploy_tx_hash"], "deploy")
    if proof.get("withdraw_tx_hash"):
        check_tx_finalized(client, proof["withdraw_tx_hash"], "withdraw_claimant")
    for case in proof["cases"]:
        check_tx_finalized(client, case["tx_hash"], case["case_id"])
        for extra_name, extra_tx in (case.get("additional_pool_txs") or {}).items():
            check_tx_finalized(client, extra_tx, f"{case['case_id']}:{extra_name}")

    print("Verifying on-chain contract views...")
    pools = unwrap_json(client.read_contract(address=contract_addr, function_name="get_all_pools", args=[]))
    claims = unwrap_json(client.read_contract(address=contract_addr, function_name="get_all_claims", args=[]))
    rejections = unwrap_json(
        client.read_contract(address=contract_addr, function_name="get_rejected_submissions", args=[])
    )
    stats = unwrap_json(client.read_contract(address=contract_addr, function_name="get_protocol_stats", args=[]))

    pools_by_id = {p["pool_id"]: p for p in pools}
    claims_by_id = {c["claim_id"]: c for c in claims}

    if len(rejections) < 1:
        raise AssertionError("Expected at least 1 recorded TOO_VAGUE rejection on-chain")

    for case in proof["cases"]:
        cid = case.get("claim_id", 0)
        pid = case.get("pool_id", 0)
        if cid:
            onchain_claim = claims_by_id.get(cid)
            if not onchain_claim:
                raise AssertionError(f"Claim #{cid} missing on-chain for {case['case_id']}")
            if onchain_claim["verdict"] != case["outcome"]:
                raise AssertionError(
                    f"Verdict mismatch for {case['case_id']}: onchain={onchain_claim['verdict']} proof={case['outcome']}"
                )
            if onchain_claim["snippet_sha256"] != case["snippet_sha256"]:
                raise AssertionError(f"Snippet SHA-256 mismatch for {case['case_id']}")
            if case["outcome"] in ("ORIGIN_VERIFIED", "CONTRADICTED_BY_SOURCE"):
                quote = onchain_claim["evidence_quote"]
                if len(quote) < 10 or quote not in onchain_claim["snippet_excerpt"]:
                    raise AssertionError(f"Quote not verbatim in snippet for {case['case_id']}")
        elif pid:
            onchain_pool = pools_by_id.get(pid)
            if not onchain_pool:
                raise AssertionError(f"Pool #{pid} missing on-chain for {case['case_id']}")
            if onchain_pool["clause_sha256"] != case["clause_sha256"]:
                raise AssertionError(f"Clause SHA-256 mismatch for {case['case_id']}")

    print(
        f"[OK] Verified {len(proof['cases'])} cases, {len(pools)} pools, "
        f"{len(claims)} claims, {stats['total_vague_rejections']} vague rejections on StudioNet!"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
