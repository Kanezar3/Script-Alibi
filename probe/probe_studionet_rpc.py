import json
import time
import requests
import genlayer_py.provider.provider as gl_provider
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.exceptions import GenLayerError

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


class BrowserGenLayerProvider(gl_provider.GenLayerProvider):
    def make_request(self, method, params):
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": method,
            "params": params,
        }
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
            raise GenLayerError(f"Request to {self.url} failed: {str(err)}") from err
        try:
            resp = response.json()
        except ValueError as err:
            preview = response.text[:500]
            raise GenLayerError(
                f"{method} returned invalid JSON (status={response.status_code}): {err}. Body: {preview}"
            ) from err
        self._raise_on_error(resp, method)
        return resp


# Patch before creating client so initialize_consensus_smart_contract uses browser UA
gl_provider.GenLayerProvider = BrowserGenLayerProvider
import genlayer_py.client.genlayer_client as gl_client_mod
gl_client_mod.GenLayerProvider = BrowserGenLayerProvider

acct = create_account()
print("Test account:", acct.address)
client = create_client(chain=studionet, account=acct)
print("ConsensusMain address:", client.chain.consensus_main_contract["address"])
print("Fetched from RPC?", getattr(client.chain, "__consensus_abi_fetched_from_rpc", None))

latest_block = client.w3.eth.get_block("latest")
print("Latest block number:", latest_block["number"], "baseFeePerGas:", latest_block.get("baseFeePerGas"))
bal = client.w3.eth.get_balance(acct.address)
print("Initial balance:", bal)

# Test if sim_fundAccount works on StudioNet
try:
    res = client.provider.make_request("sim_fundAccount", [acct.address, 10**19])
    print("sim_fundAccount result:", res)
    bal_after = client.w3.eth.get_balance(acct.address)
    print("Balance after sim_fundAccount:", bal_after)
except Exception as e:
    print("sim_fundAccount error:", e)
