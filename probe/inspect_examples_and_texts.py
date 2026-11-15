import hashlib
import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
H = {"User-Agent": UA}

print("=== A. GENLAYER OFFICIAL EXAMPLE CONTRACTS ===")
examples = [
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/examples/contracts/wizard_of_coin.py",
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/examples/contracts/football_prediction_market.py",
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/examples/contracts/faucet.py",
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/examples/contracts/tip_jar.py",
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/tests/integration/icontracts/contracts/intelligent_oracle.py",
]
for url in examples:
    r = requests.get(url, headers=H, timeout=20)
    print(f"\n--- {url.split('/')[-1]} (status={r.status_code}) ---")
    print(r.text[:2500])

print("\n=== B. WIZARD OF OZ (55.txt) ===")
oz_url = "https://raw.githubusercontent.com/GITenberg/The-Wonderful-Wizard-of-Oz_55/d19a4315b7c6f4471de8840a1a81609b34841dff/55.txt"
oz = requests.get(oz_url, headers=H, timeout=20).text.replace("\r\n", "\n").replace("\r", "\n")
oz_lines = oz.split("\n")
print("Oz total lines:", len(oz_lines), "bytes:", len(oz.encode()))
for i, line in enumerate(oz_lines, 1):
    if "silver shoes" in line.lower():
        print(f"  Oz L{i}: {line}")
print("Oz sample lines 40-90:")
for i in range(40, min(91, len(oz_lines)+1)):
    print(f"{i:4d}: {oz_lines[i-1]}")

print("\n=== C1. FRANKENSTEIN 1818 (41445-0.txt) ===")
fr_url = "https://raw.githubusercontent.com/GITenberg/Frankenstein--Or-The-Modern-Prometheus_41445/ef960c01b76e0b445687973448b73695c0fdc12e/41445-0.txt"
fr = requests.get(fr_url, headers=H, timeout=20).text.replace("\r\n", "\n").replace("\r", "\n")
fr_lines = fr.split("\n")
print("Frankenstein 1818 total lines:", len(fr_lines))
for i, line in enumerate(fr_lines, 1):
    if "dreary night of november" in line.lower() or "spark of being" in line.lower() or "yellow skin" in line.lower():
        print(f"  Frankenstein L{i}: {line}")
        for j in range(max(1, i-2), min(len(fr_lines), i+15)+1):
            print(f"    {j:4d}: {fr_lines[j-1]}")

print("\n=== C2. DRACULA (pg345.txt) ===")
dr_url = "https://raw.githubusercontent.com/cpwardell/dracula/0fd55e1ae21742ce3e28e26d78ebc46717642663/pg345.txt"
dr = requests.get(dr_url, headers=H, timeout=20).text.replace("\r\n", "\n").replace("\r", "\n")
dr_lines = dr.split("\n")
print("Dracula total lines:", len(dr_lines))
for kw in ["kukri", "bowie knife", "piccadilly", "broad daylight", "crumbled into dust"]:
    for i, line in enumerate(dr_lines, 1):
        if kw in line.lower():
            print(f"  Dracula match '{kw}' L{i}: {line}")
            for j in range(max(1, i-3), min(len(dr_lines), i+6)+1):
                print(f"    {j:4d}: {dr_lines[j-1]}")
            break
