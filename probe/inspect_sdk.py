import inspect
import json
import sys
import httpx
import requests
import genlayer_py
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

print("python:", sys.version)
print("genlayer_py:", getattr(genlayer_py, "__version__", "unknown"))
print("studionet:", studionet)
print("studionet dir:", [a for a in dir(studionet) if not a.startswith("_")])
for k in dir(studionet):
    if not k.startswith("_"):
        print(f"  studionet.{k} =", getattr(studionet, k))

acct = create_account()
print("sample account address:", acct.address)

client = create_client(chain=studionet, account=acct)
print("client type:", type(client))
print("client methods:", [m for m in dir(client) if not m.startswith("_")])
for fn_name in [
    "deploy_contract",
    "write_contract",
    "read_contract",
    "wait_for_finalization",
    "wait_for_transaction_receipt",
    "get_transaction",
    "estimate_transaction_fees",
    "fund_account",
]:
    if hasattr(client, fn_name):
        print(f"--- {fn_name} ---")
        try:
            print(inspect.signature(getattr(client, fn_name)))
        except Exception as e:
            print("sig err:", e)

print("\nTesting direct StudioNet RPC calls...")
ua = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
payload = {"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []}
headers = {
    "User-Agent": ua,
    "Content-Type": "application/json",
    "Accept": "application/json",
}

for label, fn in [
    ("requests", lambda: requests.post("https://studio.genlayer.com/api", json=payload, headers=headers, timeout=20)),
    ("httpx", lambda: httpx.post("https://studio.genlayer.com/api", json=payload, headers=headers, timeout=20)),
]:
    try:
        r = fn()
        print(label, "status:", r.status_code, "body:", r.text[:300])
    except Exception as e:
        print(label, "error:", repr(e))
