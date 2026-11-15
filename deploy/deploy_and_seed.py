"""Resumable StudioNet deployment & 6-case live seeding script for ScriptAlibi.

Saves deployer/claimant keys and every tx hash to deploy/.deployer_state.json
(gitignored) BEFORE polling so interrupted runs resume cleanly without re-sending.
Writes public verification artifact to deploy/proof.json (never includes keys).
"""

import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.exceptions import GenLayerError
from genlayer_py.provider import GenLayerProvider
from genlayer_py.types import TransactionStatus

ROOT_DIR = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT_DIR / "contracts" / "script_alibi.py"
PROBE_RESULTS_PATH = ROOT_DIR / "deploy" / "probe_results.json"
STATE_PATH = ROOT_DIR / "deploy" / ".deployer_state.json"
PROOF_PATH = ROOT_DIR / "deploy" / "proof.json"

RPC_URL = "https://studio.genlayer.com/api"
EXPLORER_URL = "https://explorer-studio.genlayer.com"
CHAIN_ID = 61999
POLL_INTERVAL_MS = 9000
POLL_RETRIES = 80
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

BOUNTY_WEI = 1_000_000_000_000_000  # 0.001 GEN
STAKE_WEI = 200_000_000_000_000     # 0.0002 GEN
FUND_AMOUNT_WEI = 5_000_000_000_000_000_000  # 5 GEN


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
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": BROWSER_UA,
                    },
                    timeout=30,
                )
            except requests.exceptions.RequestException as err:
                if attempt == 3:
                    raise GenLayerError(f"Request to {self.url} failed: {err}") from err
                time.sleep(4 * (attempt + 1))
                continue

            if response.status_code == 429:
                time.sleep(10 * (attempt + 1))
                continue

            try:
                resp = response.json()
            except ValueError as err:
                preview = response.text[:400]
                if attempt < 3:
                    time.sleep(5)
                    continue
                raise GenLayerError(
                    f"{method} returned invalid JSON: {err}. Response: {preview}"
                ) from err
            self._raise_on_error(resp, method)
            return resp
        raise GenLayerError(f"{method} failed after retries")

    GenLayerProvider.make_request = _make_request


def load_state() -> dict[str, Any]:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"txs": {}}


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def rpc_fund_account(address: str, amount_wei: int) -> None:
    resp = requests.post(
        RPC_URL,
        json={
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": "sim_fundAccount",
            "params": [address, amount_wei],
        },
        headers={"Content-Type": "application/json", "User-Agent": BROWSER_UA},
        timeout=30,
    )
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"sim_fundAccount failed for {address}: {data['error']}")


def ensure_funded(client, address: str, min_wei: int = 100_000_000_000_000_000) -> None:
    bal = int(client.get_balance(address))
    if bal < min_wei:
        print(f"Funding {address} via sim_fundAccount...")
        rpc_fund_account(address, FUND_AMOUNT_WEI)
        time.sleep(2)


def assert_exec_success(receipt: dict[str, Any], label: str) -> None:
    lr = (receipt.get("consensus_data") or {}).get("leader_receipt") or []
    if not lr or lr[0].get("execution_result") != "SUCCESS":
        raise RuntimeError(
            f"Tx [{label}] failed execution (execution_result={lr[0].get('execution_result') if lr else None}): "
            f"{json.dumps(receipt, default=str)[:800]}"
        )


def unwrap_json(val: Any) -> Any:
    if isinstance(val, str):
        return json.loads(val)
    return val


def wait_finalized(client, tx_hash: str, label: str) -> dict[str, Any]:
    print(f"Waiting for finality [{label}]: {tx_hash}", flush=True)
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.FINALIZED,
        interval=POLL_INTERVAL_MS,
        retries=POLL_RETRIES,
        full_transaction=True,
    )
    rec = receipt if isinstance(receipt, dict) else dict(receipt)
    assert_exec_success(rec, label)
    return rec


def run_step_tx(
    state: dict[str, Any],
    step_key: str,
    client,
    send_fn,
) -> tuple[str, dict[str, Any]]:
    tx_entry = state["txs"].get(step_key)
    if tx_entry and tx_entry.get("receipt"):
        print(f"Resuming completed step [{step_key}]: {tx_entry['tx_hash']}")
        return tx_entry["tx_hash"], tx_entry["receipt"]

    if tx_entry and tx_entry.get("tx_hash"):
        tx_hash = tx_entry["tx_hash"]
        print(f"Resuming pending tx [{step_key}]: {tx_hash}")
    else:
        tx_hash = send_fn()
        if not isinstance(tx_hash, str):
            tx_hash = str(tx_hash)
        state["txs"][step_key] = {"tx_hash": tx_hash}
        save_state(state)
        print(f"Submitted [{step_key}]: {tx_hash}")

    receipt = wait_finalized(client, tx_hash, step_key)
    state["txs"][step_key]["receipt"] = receipt
    save_state(state)
    return tx_hash, receipt


def extract_contract_address(receipt: dict[str, Any]) -> str:
    zero = "0x" + "0" * 40
    candidates = [
        receipt.get("contract_address"),
        receipt.get("to_address"),
        receipt.get("recipient"),
    ]
    for container_key in ("tx_data_decoded", "data", "tx_data"):
        container = receipt.get(container_key)
        if isinstance(container, dict):
            candidates.append(container.get("contract_address"))

    for val in candidates:
        if isinstance(val, str) and val.startswith("0x") and len(val) == 42 and val.lower() != zero:
            return val
    raise RuntimeError(f"Could not extract contract_address from receipt: {json.dumps(receipt)[:500]}")


def main() -> int:
    patch_provider_user_agent()
    probe = json.loads(PROBE_RESULTS_PATH.read_text(encoding="utf-8"))
    sources = {s["case"]: s for s in probe["verified_sources"]}
    contract_source = CONTRACT_PATH.read_text(encoding="utf-8")
    source_sha256 = hashlib.sha256(contract_source.encode("utf-8")).hexdigest()

    state = load_state()

    env_key = os.environ.get("DEPLOYER_PRIVATE_KEY")
    if env_key:
        deployer = create_account(env_key)
    elif state.get("deployer_private_key"):
        deployer = create_account(state["deployer_private_key"])
    else:
        deployer = create_account()
        state["deployer_private_key"] = deployer.key.hex()
        save_state(state)

    if state.get("claimant_private_key"):
        claimant = create_account(state["claimant_private_key"])
    else:
        claimant = create_account()
        state["claimant_private_key"] = claimant.key.hex()
        save_state(state)

    client = create_client(chain=studionet, endpoint=RPC_URL, account=deployer)
    ensure_funded(client, deployer.address)
    ensure_funded(client, claimant.address)

    deploy_tx, deploy_receipt = run_step_tx(
        state,
        "deploy",
        client,
        lambda: client.deploy_contract(code=contract_source, account=deployer),
    )
    contract_addr = state.get("contract_address") or extract_contract_address(deploy_receipt)
    state["contract_address"] = contract_addr
    save_state(state)
    print(f"ScriptAlibi deployed at: {contract_addr}")

    deadline_ts = int(time.time()) + 30 * 86400

    # Case 1: TOO_VAGUE rejection (refundable balance credited)
    tx1, rec1 = run_step_tx(
        state,
        "case1_too_vague",
        client,
        lambda: client.write_contract(
            address=contract_addr,
            function_name="create_clearance_pool",
            account=deployer,
            value=BOUNTY_WEI,
            args=[
                "Dracula (1897)",
                "Authentic Victorian gothic vibe and eerie atmospheric mood",
                deadline_ts,
            ],
        ),
    )

    # Case 2a: CLEARABLE Pool 1 (Oz silver shoes)
    tx2a, rec2a = run_step_tx(
        state,
        "case2a_pool_oz_verified",
        client,
        lambda: client.write_contract(
            address=contract_addr,
            function_name="create_clearance_pool",
            account=deployer,
            value=BOUNTY_WEI,
            args=[
                "The Wonderful Wizard of Oz (1900)",
                "In L. Frank Baum's 1900 passage, Dorothy's enchanted shoes are described as silver shoes.",
                deadline_ts,
            ],
        ),
    )

    # Case 2b: CLEARABLE Pool 2 (Dracula sunlight myth -> contradicted by knives)
    tx2b, rec2b = run_step_tx(
        state,
        "case2b_pool_dracula_contradict",
        client,
        lambda: client.write_contract(
            address=contract_addr,
            function_name="create_clearance_pool",
            account=deployer,
            value=BOUNTY_WEI,
            args=[
                "Dracula (1897)",
                "Dracula is destroyed solely by direct sunlight turning him to ash.",
                deadline_ts,
            ],
        ),
    )

    # Case 2c: CLEARABLE Pool 3 (Oz silver shoes, used for Case 5 insufficient & Case 6 injection)
    tx2c, rec2c = run_step_tx(
        state,
        "case2c_pool_oz_open",
        client,
        lambda: client.write_contract(
            address=contract_addr,
            function_name="create_clearance_pool",
            account=deployer,
            value=BOUNTY_WEI,
            args=[
                "The Wonderful Wizard of Oz (1900)",
                "In L. Frank Baum's 1900 passage, Dorothy's enchanted shoes are described as silver shoes.",
                deadline_ts,
            ],
        ),
    )

    oz_src = sources["case_a_b_oz_silver_shoes"]
    drac_src = sources["case_c1_dracula_knives_not_sunlight"]
    toc_src = sources["case_d_oz_unrelated_toc"]
    inj_src = sources["case_e_prompt_injection_fixture"]

    # Case 3: ORIGIN_VERIFIED (Pool 1)
    tx3, rec3 = run_step_tx(
        state,
        "case3_origin_verified",
        client,
        lambda: client.write_contract(
            address=contract_addr,
            function_name="submit_alibi_claim",
            account=claimant,
            value=STAKE_WEI,
            args=[1, oz_src["url"], oz_src["start_line"], oz_src["end_line"]],
        ),
    )

    # Case 4: CONTRADICTED_BY_SOURCE (Pool 2)
    tx4, rec4 = run_step_tx(
        state,
        "case4_contradicted",
        client,
        lambda: client.write_contract(
            address=contract_addr,
            function_name="submit_alibi_claim",
            account=claimant,
            value=STAKE_WEI,
            args=[2, drac_src["url"], drac_src["start_line"], drac_src["end_line"]],
        ),
    )

    # Case 5: INSUFFICIENT_EVIDENCE (Pool 3)
    tx5, rec5 = run_step_tx(
        state,
        "case5_insufficient",
        client,
        lambda: client.write_contract(
            address=contract_addr,
            function_name="submit_alibi_claim",
            account=claimant,
            value=STAKE_WEI,
            args=[3, toc_src["url"], toc_src["start_line"], toc_src["end_line"]],
        ),
    )

    # Case 6: Adversarial Prompt Injection (Pool 3)
    tx6, rec6 = run_step_tx(
        state,
        "case6_prompt_injection",
        client,
        lambda: client.write_contract(
            address=contract_addr,
            function_name="submit_alibi_claim",
            account=claimant,
            value=STAKE_WEI,
            args=[3, inj_src["url"], inj_src["start_line"], inj_src["end_line"]],
        ),
    )

    # Live EOA withdrawal check for claimant
    withdraw_tx, withdraw_rec = run_step_tx(
        state,
        "withdraw_claimant",
        client,
        lambda: client.write_contract(
            address=contract_addr,
            function_name="withdraw_refundable",
            account=claimant,
            args=[],
        ),
    )

    pools = unwrap_json(client.read_contract(address=contract_addr, function_name="get_all_pools", args=[]))
    claims = unwrap_json(client.read_contract(address=contract_addr, function_name="get_all_claims", args=[]))
    rejections = unwrap_json(
        client.read_contract(address=contract_addr, function_name="get_rejected_submissions", args=[])
    )
    stats = unwrap_json(client.read_contract(address=contract_addr, function_name="get_protocol_stats", args=[]))
    deployer_refundable = client.read_contract(
        address=contract_addr, function_name="get_refundable_balance", args=[deployer.address]
    )
    claimant_refundable = client.read_contract(
        address=contract_addr, function_name="get_refundable_balance", args=[claimant.address]
    )

    claims_by_id = {c["claim_id"]: c for c in claims}
    pools_by_id = {p["pool_id"]: p for p in pools}

    proof = {
        "schema_version": "1.0.0",
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "network": {
            "name": "GenLayer StudioNet",
            "rpc_url": RPC_URL,
            "chain_id": CHAIN_ID,
            "explorer_url": EXPLORER_URL,
        },
        "contract_address": contract_addr,
        "deployer_address": deployer.address,
        "claimant_address": claimant.address,
        "deploy_tx_hash": deploy_tx,
        "withdraw_tx_hash": withdraw_tx,
        "explorer_contract_url": f"{EXPLORER_URL}/address/{contract_addr}",
        "explorer_deploy_tx_url": f"{EXPLORER_URL}/tx/{deploy_tx}",
        "contract_source_path": "contracts/script_alibi.py",
        "contract_source_sha256": source_sha256,
        "runner_hash": probe["runner_hash"],
        "protocol_stats": stats,
        "refundable_balances": {
            "deployer": str(deployer_refundable),
            "claimant": str(claimant_refundable),
        },
        "pools": pools,
        "claims": claims,
        "rejected_submissions": rejections,
        "cases": [
            {
                "case_id": "case_1_too_vague",
                "title": "Case 1: TOO_VAGUE Clause Rejection & Deposit Credit",
                "tx_hash": tx1,
                "explorer_tx_url": f"{EXPLORER_URL}/tx/{tx1}",
                "finality_status": str(rec1.get("status_name") or rec1.get("status") or "FINALIZED"),
                "outcome": "TOO_VAGUE",
                "pool_id": 0,
                "claim_id": 0,
                "inputs": {
                    "work_title": "Dracula (1897)",
                    "element_clause": "Authentic Victorian gothic vibe and eerie atmospheric mood",
                    "bounty_wei": str(BOUNTY_WEI),
                },
                "rationale": rejections[0]["rationale"] if rejections else "",
                "credited_refundable_wei": str(BOUNTY_WEI),
            },
            {
                "case_id": "case_2_clearable",
                "title": "Case 2: CLEARABLE Pool Acceptance (Oz Silver Shoes)",
                "tx_hash": tx2a,
                "explorer_tx_url": f"{EXPLORER_URL}/tx/{tx2a}",
                "finality_status": str(rec2a.get("status_name") or rec2a.get("status") or "FINALIZED"),
                "outcome": "CLEARABLE",
                "pool_id": 1,
                "claim_id": 0,
                "clause_sha256": pools_by_id.get(1, {}).get("clause_sha256", ""),
                "inputs": {
                    "work_title": "The Wonderful Wizard of Oz (1900)",
                    "element_clause": "In L. Frank Baum's 1900 passage, Dorothy's enchanted shoes are described as silver shoes.",
                    "bounty_wei": str(BOUNTY_WEI),
                },
                "rationale": pools_by_id.get(1, {}).get("rationale", ""),
                "additional_pool_txs": {"pool_2_dracula": tx2b, "pool_3_oz_open": tx2c},
            },
            {
                "case_id": "case_3_origin_verified",
                "title": "Case 3: ORIGIN_VERIFIED (Baum 1900 Silver Shoes)",
                "tx_hash": tx3,
                "explorer_tx_url": f"{EXPLORER_URL}/tx/{tx3}",
                "finality_status": str(rec3.get("status_name") or rec3.get("status") or "FINALIZED"),
                "outcome": claims_by_id.get(1, {}).get("verdict", ""),
                "pool_id": 1,
                "claim_id": 1,
                "clause_sha256": pools_by_id.get(1, {}).get("clause_sha256", ""),
                "snippet_sha256": claims_by_id.get(1, {}).get("snippet_sha256", ""),
                "evidence_quote": claims_by_id.get(1, {}).get("evidence_quote", ""),
                "rationale": claims_by_id.get(1, {}).get("rationale", ""),
                "snippet_excerpt": claims_by_id.get(1, {}).get("snippet_excerpt", ""),
                "inputs": {
                    "evidence_url": oz_src["url"],
                    "start_line": oz_src["start_line"],
                    "end_line": oz_src["end_line"],
                    "stake_wei": str(STAKE_WEI),
                },
            },
            {
                "case_id": "case_4_contradicted",
                "title": "Case 4: CONTRADICTED_BY_SOURCE (Dracula 1897 Knives vs Sunlight Myth)",
                "tx_hash": tx4,
                "explorer_tx_url": f"{EXPLORER_URL}/tx/{tx4}",
                "finality_status": str(rec4.get("status_name") or rec4.get("status") or "FINALIZED"),
                "outcome": claims_by_id.get(2, {}).get("verdict", ""),
                "pool_id": 2,
                "claim_id": 2,
                "clause_sha256": pools_by_id.get(2, {}).get("clause_sha256", ""),
                "snippet_sha256": claims_by_id.get(2, {}).get("snippet_sha256", ""),
                "evidence_quote": claims_by_id.get(2, {}).get("evidence_quote", ""),
                "rationale": claims_by_id.get(2, {}).get("rationale", ""),
                "snippet_excerpt": claims_by_id.get(2, {}).get("snippet_excerpt", ""),
                "inputs": {
                    "evidence_url": drac_src["url"],
                    "start_line": drac_src["start_line"],
                    "end_line": drac_src["end_line"],
                    "stake_wei": str(STAKE_WEI),
                },
            },
            {
                "case_id": "case_5_insufficient",
                "title": "Case 5: INSUFFICIENT_EVIDENCE (Unrelated Table of Contents)",
                "tx_hash": tx5,
                "explorer_tx_url": f"{EXPLORER_URL}/tx/{tx5}",
                "finality_status": str(rec5.get("status_name") or rec5.get("status") or "FINALIZED"),
                "outcome": claims_by_id.get(3, {}).get("verdict", ""),
                "pool_id": 3,
                "claim_id": 3,
                "clause_sha256": pools_by_id.get(3, {}).get("clause_sha256", ""),
                "snippet_sha256": claims_by_id.get(3, {}).get("snippet_sha256", ""),
                "evidence_quote": claims_by_id.get(3, {}).get("evidence_quote", ""),
                "rationale": claims_by_id.get(3, {}).get("rationale", ""),
                "snippet_excerpt": claims_by_id.get(3, {}).get("snippet_excerpt", ""),
                "inputs": {
                    "evidence_url": toc_src["url"],
                    "start_line": toc_src["start_line"],
                    "end_line": toc_src["end_line"],
                    "stake_wei": str(STAKE_WEI),
                },
            },
            {
                "case_id": "case_6_prompt_injection",
                "title": "Case 6: Adversarial Prompt Injection Defense",
                "tx_hash": tx6,
                "explorer_tx_url": f"{EXPLORER_URL}/tx/{tx6}",
                "finality_status": str(rec6.get("status_name") or rec6.get("status") or "FINALIZED"),
                "outcome": claims_by_id.get(4, {}).get("verdict", ""),
                "pool_id": 3,
                "claim_id": 4,
                "clause_sha256": pools_by_id.get(3, {}).get("clause_sha256", ""),
                "snippet_sha256": claims_by_id.get(4, {}).get("snippet_sha256", ""),
                "evidence_quote": claims_by_id.get(4, {}).get("evidence_quote", ""),
                "rationale": claims_by_id.get(4, {}).get("rationale", ""),
                "snippet_excerpt": claims_by_id.get(4, {}).get("snippet_excerpt", ""),
                "inputs": {
                    "evidence_url": inj_src["url"],
                    "start_line": inj_src["start_line"],
                    "end_line": inj_src["end_line"],
                    "stake_wei": str(STAKE_WEI),
                },
            },
        ],
    }

    PROOF_PATH.write_text(json.dumps(proof, indent=2), encoding="utf-8")
    print(f"Wrote live proof to {PROOF_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
