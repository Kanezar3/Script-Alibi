import json
import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
GH_HEADERS = {"User-Agent": UA, "Accept": "application/vnd.github+json"}

print("=== 1. Check genlayerlabs/genlayer-studio for runner hashes ===")
for path in [
    "examples/contracts",
    "backend/node/genvm/origin/base_contracts.py",
    "tests/integration/icontracts/contracts",
]:
    url = f"https://api.github.com/repos/genlayerlabs/genlayer-studio/contents/{path}"
    r = requests.get(url, headers=GH_HEADERS, timeout=20)
    print(path, r.status_code)
    if r.status_code == 200 and isinstance(r.json(), list):
        for item in r.json()[:10]:
            print(" ", item["name"], item["type"], item.get("download_url"))
            if item["name"].endswith(".py") and item.get("download_url"):
                code = requests.get(item["download_url"], headers=GH_HEADERS, timeout=20).text
                for line in code.splitlines()[:5]:
                    if "Depends" in line or "py-genlayer" in line:
                        print("   HEADER:", line)

print("\n=== 2. Check StudioNet explorer URLs ===")
for exp in ["https://explorer-studio.genlayer.com", "https://genlayer-explorer.vercel.app"]:
    try:
        r = requests.get(exp, headers={"User-Agent": UA}, timeout=15, allow_redirects=True)
        print(exp, "->", r.status_code, r.url)
    except Exception as e:
        print(exp, "err:", e)

print("\n=== 3. Check GITenberg & Dracula repos for 40-hex commit SHAs ===")
repos = [
    "GITenberg/The-Wonderful-Wizard-of-Oz_55",
    "GITenberg/Frankenstein--Or-The-Modern-Prometheus_41445",
    "cpwardell/dracula",
    "OWASP/www-project-top-10-for-large-language-model-applications",
    "NVIDIA/garak",
]
for repo in repos:
    r = requests.get(f"https://api.github.com/repos/{repo}", headers=GH_HEADERS, timeout=20)
    if r.status_code != 200:
        print(repo, "repo status:", r.status_code)
        continue
    branch = r.json()["default_branch"]
    c = requests.get(f"https://api.github.com/repos/{repo}/commits/{branch}", headers=GH_HEADERS, timeout=20)
    sha = c.json().get("sha") if c.status_code == 200 else None
    t = requests.get(f"https://api.github.com/repos/{repo}/contents", headers=GH_HEADERS, timeout=20)
    files = [f["name"] for f in t.json() if isinstance(f, dict)] if t.status_code == 200 else []
    print(f"{repo} branch={branch} sha={sha}")
    print("  top files:", [x for x in files if x.endswith(".txt") or x.endswith(".md") or "vuln" in x.lower()][:12])
