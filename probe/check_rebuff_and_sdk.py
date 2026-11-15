import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
H = {"User-Agent": UA}

for u in [
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/tests/integration/icontracts/contracts/payable_escrow.py",
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/tests/integration/icontracts/contracts/company_naming.py",
]:
    print(f"=== {u.split('/')[-1]} ===")
    print(requests.get(u, headers=H, timeout=20).text)

for path in [
    "python-sdk/tests/test_sdk.py",
    "python-sdk/tests/test_integration.py",
    "python-sdk/tests/test_langchain.py",
]:
    u = f"https://raw.githubusercontent.com/protectai/rebuff/4d2fe064abf164e7381556d23e48e210080f8afa/{path}"
    r = requests.get(u, headers=H, timeout=20)
    print(f"=== rebuff {path} ({r.status_code}) ===")
    for i, line in enumerate(r.text.splitlines(), 1):
        if any(k in line.lower() for k in ["ignore", "override", "system", "drop table", "secret"]):
            print(f"  L{i}: {line}")
