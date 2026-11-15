import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
H = {"User-Agent": UA}

print("=== 1. Search genlayer-studio contracts for web.get / run_nondet / exec_prompt ===")
for folder in ["examples/contracts", "tests/integration/icontracts/contracts"]:
    r = requests.get(f"https://api.github.com/repos/genlayerlabs/genlayer-studio/contents/{folder}", headers=H, timeout=20)
    for item in r.json():
        if item["name"].endswith(".py") and item.get("download_url"):
            txt = requests.get(item["download_url"], headers=H, timeout=20).text
            hits = [l.strip() for l in txt.splitlines() if any(k in l for k in ["web.get", "web.render", "run_nondet", "exec_prompt", "eq_principle", "emit_transfer", "message_raw"])]
            if hits:
                print(f"  {item['name']}:")
                for h in hits[:10]:
                    print(f"    {h}")

print("\n=== 2. Check prompt injection files on GitHub ===")
# Check garak promptinject.py, goodside.py, protectai/rebuff, and other public security repos
candidates = [
    ("NVIDIA/garak", "892779207cbc38f65a738ef9cbdfbc1e83aa0b55", "garak/probes/promptinject.py"),
    ("NVIDIA/garak", "892779207cbc38f65a738ef9cbdfbc1e83aa0b55", "garak/probes/goodside.py"),
    ("NVIDIA/garak", "892779207cbc38f65a738ef9cbdfbc1e83aa0b55", "garak/probes/divergence.py"),
]
for repo, sha, path in candidates:
    u = f"https://raw.githubusercontent.com/{repo}/{sha}/{path}"
    r = requests.get(u, headers=H, timeout=20)
    print(u, r.status_code)
    if r.status_code == 200:
        lines = r.text.splitlines()
        for i, line in enumerate(lines, 1):
            if any(k in line.lower() for k in ["ignore", "override", "system", "instruction", "never mind"]):
                print(f"  L{i}: {line[:120]}")

# Also check protectai/rebuff repo commit sha and test files
r = requests.get("https://api.github.com/repos/protectai/rebuff/commits/main", headers=H, timeout=20)
if r.status_code == 200:
    r_sha = r.json()["sha"]
    print("protectai/rebuff sha:", r_sha)
    tr = requests.get(f"https://api.github.com/repos/protectai/rebuff/git/trees/{r_sha}?recursive=1", headers=H, timeout=20)
    if tr.status_code == 200:
        for f in tr.json().get("tree", []):
            if any(k in f["path"].lower() for k in ["test", "example", "eval", "prompt", "readme"]):
                if f["path"].endswith((".py", ".md", ".txt", ".json")):
                    print(" ", f["path"])
