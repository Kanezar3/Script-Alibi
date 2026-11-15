import hashlib
import json
import os
import time
from pathlib import Path

import requests
import genlayer_py.provider.provider as gl_provider
import genlayer_py.client.genlayer_client as gl_client_mod
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.exceptions import GenLayerError
from genlayer_py.types import TransactionStatus

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
RUNNER_HASH = "1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6"
ROOT = Path(__file__).resolve().parent.parent
PROBE_CONTRACT_PATH = ROOT / "probe" / "evidence_probe.py"
RESULTS_PATH = ROOT / "deploy" / "probe_results.json"

CANDIDATE_SOURCES = [
    {
        "case": "case_a_b_oz_silver_shoes",
        "title": "The Wonderful Wizard of Oz (1900) - Silver Shoes",
        "url": "https://raw.githubusercontent.com/GITenberg/The-Wonderful-Wizard-of-Oz_55/d19a4315b7c6f4471de8840a1a81609b34841dff/55.txt",
        "start_line": 499,
        "end_line": 522,
        "purpose": "Proves Dorothy's enchanted shoes are silver shoes (not ruby slippers).",
    },
    {
        "case": "case_c1_dracula_knives_not_sunlight",
        "title": "Dracula (1897) - Destruction by Kukri and Bowie Knife",
        "url": "https://raw.githubusercontent.com/cpwardell/dracula/0fd55e1ae21742ce3e28e26d78ebc46717642663/pg345.txt",
        "start_line": 15417,
        "end_line": 15445,
        "purpose": "Proves Dracula is destroyed by Jonathan's Kukri knife and Quincey Morris's bowie knife just before sunset (not burned by sunlight).",
    },
    {
        "case": "case_c2_frankenstein_1818_creation",
        "title": "Frankenstein (1818 Edition) - Creature Appearance & Origin",
        "url": "https://raw.githubusercontent.com/GITenberg/Frankenstein--Or-The-Modern-Prometheus_41445/ef960c01b76e0b445687973448b73695c0fdc12e/41445-0.txt",
        "start_line": 1426,
        "end_line": 1444,
        "purpose": "Proves the 1818 creature has yellow skin, watery eyes, and lustrous black hair in a candlelit room (no green skin or steel neck bolts).",
    },
    {
        "case": "case_d_oz_unrelated_toc",
        "title": "The Wonderful Wizard of Oz (1900) - Table of Contents",
        "url": "https://raw.githubusercontent.com/GITenberg/The-Wonderful-Wizard-of-Oz_55/d19a4315b7c6f4471de8840a1a81609b34841dff/55.txt",
        "start_line": 44,
        "end_line": 71,
        "purpose": "Unrelated table of contents slice for INSUFFICIENT_EVIDENCE.",
    },
    {
        "case": "case_e_prompt_injection_fixture",
        "title": "ProtectAI Rebuff SDK Test - Prompt Injection Payload",
        "url": "https://raw.githubusercontent.com/protectai/rebuff/4d2fe064abf164e7381556d23e48e210080f8afa/python-sdk/tests/test_sdk.py",
        "start_line": 1,
        "end_line": 30,
        "purpose": "Immutable commit-pinned public test fixture containing explicit 'Ignore all previous instructions' prompt-injection text.",
    },
]


class BrowserGenLayerProvider(gl_provider.GenLayerProvider):
    def make_request(self, method, params):
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
                        "Accept": "application/json",
                        "User-Agent": BROWSER_UA,
                    },
                    timeout=30,
                )
            except requests.exceptions.RequestException as err:
                if attempt == 3:
                    raise GenLayerError(f"Request to {self.url} failed: {str(err)}") from err
                time.sleep(4 * (attempt + 1))
                continue
            if response.status_code == 429:
                time.sleep(10 * (attempt + 1))
                continue
            try:
                resp = response.json()
            except ValueError as err:
                if attempt < 3:
                    time.sleep(4)
                    continue
                raise GenLayerError(
                    f"{method} returned invalid JSON (status={response.status_code}): {response.text[:300]}"
                ) from err
            self._raise_on_error(resp, method)
            return resp
        raise GenLayerError(f"{method} failed after retries")


def patch_provider():
    gl_provider.GenLayerProvider = BrowserGenLayerProvider
    gl_client_mod.GenLayerProvider = BrowserGenLayerProvider


def local_digest(url: str, start_line: int, end_line: int) -> dict:
    r = requests.get(url, headers={"User-Agent": BROWSER_UA}, timeout=30)
    r.raise_for_status()
    norm = r.text.replace("\r\n", "\n").replace("\r", "\n")
    lines = norm.split("\n")
    selected = lines[start_line - 1 : end_line]
    snippet = " ".join(" ".join(selected).split())[:3000]
    return {
        "sha256": hashlib.sha256(snippet.encode("utf-8")).hexdigest(),
        "char_len": len(snippet),
        "excerpt": snippet[:280],
    }


def assert_exec_success(receipt: dict, label: str) -> None:
    lr = (receipt.get("consensus_data") or {}).get("leader_receipt") or []
    if not lr or lr[0].get("execution_result") != "SUCCESS":
        raise RuntimeError(f"{label} failed execution: {json.dumps(receipt, default=str)[:800]}")


def extract_contract_address(receipt: dict) -> str:
    for candidate in [
        receipt.get("data", {}).get("contract_address") if isinstance(receipt.get("data"), dict) else None,
        receipt.get("to_address"),
        receipt.get("recipient"),
        receipt.get("tx_data_decoded", {}).get("contract_address") if isinstance(receipt.get("tx_data_decoded"), dict) else None,
    ]:
        if candidate and str(candidate).startswith("0x") and int(str(candidate), 16) != 0:
            return str(candidate)
    raise RuntimeError(f"Could not find contract address in receipt: {json.dumps(receipt, default=str)[:800]}")


def main():
    patch_provider()
    acct = create_account()
    client = create_client(chain=studionet, account=acct)
    print("Probe account:", acct.address)

    # Fund ephemeral probe account on StudioNet
    fund_res = client.provider.make_request("sim_fundAccount", [acct.address, 10**19])
    print("Funded:", fund_res.get("result"))
    time.sleep(2)

    code = PROBE_CONTRACT_PATH.read_text(encoding="utf-8")
    print("Deploying probe/evidence_probe.py...")
    deploy_tx = client.deploy_contract(code=code, args=[])
    print("Deploy tx:", deploy_tx)

    # Poll >= 8s per StudioNet rate limit
    deploy_receipt = client.wait_for_transaction_receipt(
        transaction_hash=deploy_tx,
        status=TransactionStatus.FINALIZED,
        interval=8000,
        retries=45,
        full_transaction=True,
    )
    print("Deploy status_name:", deploy_receipt.get("status_name"), "result_name:", deploy_receipt.get("result_name"))
    assert_exec_success(deploy_receipt, "deploy")
    contract_addr = extract_contract_address(deploy_receipt)
    print("Probe contract address:", contract_addr)

    verified_sources = []
    for src in CANDIDATE_SOURCES:
        print(f"\n--- Probing {src['case']} ---")
        loc = local_digest(src["url"], src["start_line"], src["end_line"])
        print("  local sha256:", loc["sha256"], "len:", loc["char_len"])

        tx_hash = client.write_contract(
            address=contract_addr,
            function_name="probe_url",
            args=[src["url"], src["start_line"], src["end_line"]],
        )
        print("  probe_url tx:", tx_hash)
        receipt = client.wait_for_transaction_receipt(
            transaction_hash=tx_hash,
            status=TransactionStatus.FINALIZED,
            interval=8000,
            retries=45,
            full_transaction=True,
        )
        status_name = receipt.get("status_name")
        print("  finalized status:", status_name)
        assert_exec_success(receipt, src["case"])

        onchain_raw = client.read_contract(
            address=contract_addr,
            function_name="get_last_probe",
            args=[],
        )
        onchain = json.loads(onchain_raw) if isinstance(onchain_raw, str) else onchain_raw
        print("  onchain:", onchain)
        match = onchain["sha256"] == loc["sha256"]
        print("  SHA-256 MATCH:", match)

        verified_sources.append({
            **src,
            "local_sha256": loc["sha256"],
            "onchain_sha256": onchain["sha256"],
            "sha256_match": match,
            "char_len": onchain["char_len"],
            "sample_excerpt": onchain["excerpt"],
            "probe_tx_hash": tx_hash,
            "finality_status": str(status_name),
            "explorer_tx_url": f"https://explorer-studio.genlayer.com/tx/{tx_hash}",
        })
        time.sleep(2)

    results = {
        "network": {
            "name": "GenLayer StudioNet",
            "rpc_url": "https://studio.genlayer.com/api",
            "chain_id": 61999,
            "explorer_url": "https://explorer-studio.genlayer.com",
            "rate_limit_observed": "30 requests/minute (Cloudflare x-ratelimit-limit: 30, poll >= 8s)",
            "requires_browser_user_agent": True,
        },
        "runner_hash": RUNNER_HASH,
        "depends_header": f'# {{ "Depends": "py-genlayer:{RUNNER_HASH}" }}',
        "probe_contract_address": contract_addr,
        "probe_deploy_tx_hash": deploy_tx,
        "probe_explorer_contract_url": f"https://explorer-studio.genlayer.com/address/{contract_addr}",
        "probe_explorer_deploy_tx_url": f"https://explorer-studio.genlayer.com/tx/{deploy_tx}",
        "python_env": {
            "python_version": "3.12.13",
            "venv_path": ".venv",
            "genlayer_py_version": "0.18.0",
            "genlayer_test_version": "0.29.2",
        },
        "sdk_notes": {
            "contract_base": "class MyContract(gl.Contract)",
            "header": '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }',
            "imports": "from genlayer import *",
            "storage_collections": "TreeMap[K, V], DynArray[T], u256, Address (auto-allocated, do not instantiate in __init__)",
            "decorators": "@gl.public.write, @gl.public.write.payable, @gl.public.view",
            "web_fetch": "gl.nondet.web.get(url) -> Response(.status, .body bytes)",
            "llm_exec": "gl.nondet.exec_prompt(prompt, response_format='json')",
            "nondet_consensus": "gl.vm.run_nondet_unsafe(leader_fn, validator_fn)",
            "payable_and_transfers": "gl.message.value, gl.message.sender_address, @gl.evm.contract_interface _EoaRecipient(addr).emit_transfer(value=amount)",
            "timestamp": "gl.message_raw.get('datetime') (ISO 8601 string)",
            "errors": "raise gl.vm.UserError('...')",
        },
        "verified_sources": verified_sources,
    }

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("\nSaved results to:", RESULTS_PATH)


if __name__ == "__main__":
    main()
