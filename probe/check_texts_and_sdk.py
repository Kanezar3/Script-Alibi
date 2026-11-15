import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
H = {"User-Agent": UA}

print("=== 1. genvm_smoke_v1.py & error_web_contract.py & intelligent_oracle.py tail ===")
for u in [
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/tests/integration/icontracts/contracts/genvm_smoke_v1.py",
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/tests/integration/icontracts/contracts/error_web_contract.py",
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/tests/integration/icontracts/contracts/intelligent_oracle.py",
]:
    txt = requests.get(u, headers=H, timeout=20).text
    print(f"\n--- {u.split('/')[-1]} ---")
    if "intelligent_oracle" in u:
        print(txt[2000:6500])
    else:
        print(txt[:3500])

print("\n=== 2. Dracula death lines 15405-15450 ===")
dr = requests.get("https://raw.githubusercontent.com/cpwardell/dracula/0fd55e1ae21742ce3e28e26d78ebc46717642663/pg345.txt", headers=H, timeout=20).text.replace("\r\n", "\n")
dr_lines = dr.split("\n")
for i in range(15405, 15451):
    print(f"{i:5d}: {dr_lines[i-1]}")

print("\n=== 3. Oz silver shoes lines 290-315, 495-565, 4670-4705 ===")
oz = requests.get("https://raw.githubusercontent.com/GITenberg/The-Wonderful-Wizard-of-Oz_55/d19a4315b7c6f4471de8840a1a81609b34841dff/55.txt", headers=H, timeout=20).text.replace("\r\n", "\n")
oz_lines = oz.split("\n")
for a, b in [(290, 315), (495, 565), (4670, 4705)]:
    print(f"-- Oz {a}-{b} --")
    for i in range(a, b+1):
        print(f"{i:4d}: {oz_lines[i-1]}")

print("\n=== 4. Prompt injection fixtures on GitHub ===")
# Check OWASP LLM01 and garak promptinject / payloads
for u in [
    "https://raw.githubusercontent.com/OWASP/www-project-top-10-for-large-language-model-applications/99f4395589bdbd120ae961f9cd179e79d7f9b27f/2_0_vulns/LLM01_PromptInjection.md",
]:
    r = requests.get(u, headers=H, timeout=20)
    print("OWASP LLM01 status:", r.status_code, "len:", len(r.text))
    for i, line in enumerate(r.text.splitlines(), 1):
        if any(k in line.lower() for k in ["ignore", "override", "system", "prompt", "example"]):
            if i < 200:
                print(f"  L{i}: {line[:120]}")

# Check garak data/payloads via GitHub API
for repo_path in [
    "NVIDIA/garak/contents/garak/data",
    "NVIDIA/garak/contents/garak/probes",
    "protectai/rebuff/contents",
    "tldr-pages/tldr",
]:
    if "contents" in repo_path:
        r = requests.get(f"https://api.github.com/repos/{repo_path}", headers={"User-Agent": UA}, timeout=20)
        print(repo_path, r.status_code)
        if r.status_code == 200 and isinstance(r.json(), list):
            print(" ", [x["name"] for x in r.json()[:25]])
