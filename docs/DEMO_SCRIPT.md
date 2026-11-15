# Script Alibi — 2-Minute Reviewer & Demo Walkthrough Script

**Target Duration:** ~2:00  
**Live Contract:** [`0x8B5806dfFAfdd9CA429517e60eC37D41b0E2b8A2`](https://explorer-studio.genlayer.com/address/0x8B5806dfFAfdd9CA429517e60eC37D41b0E2b8A2) (GenLayer StudioNet, Chain ID `61999`)

---

## [0:00 – 0:20] The Problem & Core Rule
- **Narration:** "Hollywood studios love adapting public-domain classics like *The Wizard of Oz* and *Dracula*, but accidentally using a copyrighted 1930s movie invention—like ruby slippers instead of Baum's silver shoes, or sunlight burning Dracula to ash—creates massive legal risk. **Script Alibi** is a GenLayer Intelligent Contract where **the model judges, and plain Python moves money**."
- **Screen:** Open the **Proof Inspector** tab (no wallet required). Point to the masthead showing Contract `0x8B5806df...2b8A2` and the dual **Recorded StudioNet Proof** vs. **Live On-Chain StudioNet Read** panel.

## [0:20 – 0:35] Live On-Chain Verification
- **Narration:** "Without connecting a wallet, any reviewer can click **Verify Live On-Chain** to cross-check the bundled `deploy/proof.json` directly against `https://studio.genlayer.com/api`."
- **Action:** Click **Verify Live On-Chain** and highlight the `6 / 6` finalized transaction match badge and live pool/claim counts (`3` pools, `4` claims, `1` vague rejection).

## [0:35 – 1:15] Walking the 6 Finalized StudioNet Cases
- **Case 1 (`TOO_VAGUE`) — [Tx `0xa68e9ee4...`](https://explorer-studio.genlayer.com/tx/0xa68e9ee41930ab52e760a790eebecd057ade7c018e2ad671a0ef29cd30ab0769):**  
  "First, a subjective clause—*'Authentic Victorian gothic vibe'*—is rejected as `TOO_VAGUE`, and Python immediately credits the `1000000000000000` wei deposit to `refundable_balances` so funds never strand."
- **Case 2 (`CLEARABLE`) & Case 3 (`ORIGIN_VERIFIED`) — [Tx `0x7645910b...`](https://explorer-studio.genlayer.com/tx/0x7645910bb5162b32b5e8bea00c6e4e09c81583e01309b6d23264e50aa761169f):**  
  "A concrete clause on Dorothy's shoes opens Pool #1. A claimant submits Baum's 1900 text pinned by a 40-hex GitHub commit SHA (lines 499–522). Validators re-fetch the text, verify `snippet_sha256` and the highlighted verbatim quote (*'silver shoes that had belonged to the Witch of the East'*), and credit `1200000000000000` wei."
- **Case 4 (`CONTRADICTED_BY_SOURCE`) — [Tx `0x2d08c3ed...`](https://explorer-studio.genlayer.com/tx/0x2d08c3eda3fcae6a4b6d19cda7c928fbb34195fc021b0ec5f5d701f07c347409):**  
  "In Pool #2, someone claims Dracula is destroyed solely by sunlight. Stoker's 1897 text (lines 15417–15445) proves Jonathan's and Morris's knives destroy him—marking the pool `HAZARD_CONTRADICTED` and rewarding the researcher."
- **Case 5 (`INSUFFICIENT_EVIDENCE`) & Case 6 (Prompt-Injection Defense) — [Tx `0x9e9d6313...`](https://explorer-studio.genlayer.com/tx/0x9e9d63135e2334675a1174898f47bdf8623a4425f8adede391a91abce623db66):**  
  "An unrelated Table of Contents is dismissed (`INSUFFICIENT_EVIDENCE`), and in Case 6, a commit-pinned `protectai/rebuff` fixture containing `'Ignore all previous instructions...'` inside `<untrusted_evidence>` is ignored by validators; the claimant's stake forfeits to the pool creator."

## [1:15 – 2:00] Interactive Wallet Flows, Appeal Window & CLI Proof
- **Narration:** "In **Live Ledger & Wallet**, users connect MetaMask to StudioNet Chain `61999`, create pools, submit commit-pinned claims, or pull-withdraw via `withdraw_refundable()` (verified live in [Tx `0xb2f8467a...`](https://explorer-studio.genlayer.com/tx/0xb2f8467a69bdf53e685bf6b4373d183fd7eee23167c6ce5982e060823c7251a0)). Every transaction is tracked in `localStorage` across reloads through GenLayer's Appeal Window to Finalized."
- **Terminal Close:** Run `.venv\Scripts\python.exe deploy/verify_proof.py` showing `[OK] Verified 6 cases, 3 pools, 4 claims, 1 vague rejections on StudioNet!`.
