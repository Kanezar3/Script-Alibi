# GenLayer Portal Submission — Script Alibi

Ready-to-paste fields for the GenLayer Builder / StudioNet Portal submission form.

---

## Contribution Type
`Intelligent Contract + Full-Stack StudioNet dApp`

## One-liner
`Public-domain literary clearance & plot-alibi oracle on GenLayer StudioNet: validators verify verbatim quotes against commit-pinned texts while Python governs escrow.`

## Description
*(Verified <= 1,000 characters)*

```text
Script Alibi is a GenLayer Intelligent Contract and StudioNet web app that proves whether a film script's plot element originates in a public-domain literary edition rather than a copyrighted later adaptation. Following "the model judges; plain Python moves money," GenVM validators evaluate narrow JSON verdicts over commit-pinned raw texts (GitHub 40-hex SHA, Wayback id_, Wikipedia oldid) while deterministic Python enforces SHA-256 snippet equivalence, verbatim quote substring checks, bounty/stake accounting, and pull-payment refunds via refundable_balances. Live on StudioNet (0x8B5806dfFAfdd9CA429517e60eC37D41b0E2b8A2), it includes 6 finalized proof cases: TOO_VAGUE rejection, CLEARABLE pool creation, ORIGIN_VERIFIED (Wizard of Oz silver shoes), CONTRADICTED_BY_SOURCE (Dracula knives vs. sunlight myth), INSUFFICIENT_EVIDENCE, and prompt-injection defense, plus a no-wallet Proof Inspector and MetaMask workflow.
```

## How-To Steps for Reviewers
1. **Inspect Without a Wallet:** Open the **Script Alibi** frontend (`Proof Inspector` tab). Review all 6 finalized StudioNet exhibits—verdict pills, `clause_sha256`, `snippet_sha256`, highlighted verbatim `evidence_quote` inside the literary snippet, and StudioNet Explorer links.
2. **Verify Live On-Chain:** Click **Verify Live On-Chain** in the Proof Inspector header to query `https://studio.genlayer.com/api` directly and confirm recorded proof hashes and verdicts match live contract storage.
3. **Run CLI Proof Verifier:** Execute `.venv\Scripts\python.exe deploy/verify_proof.py` (or `npm run verify:proof`) to verify local `contracts/script_alibi.py` SHA-256, all finalized transaction receipts (`execution_result == "SUCCESS"`), and live `read_contract` views.
4. **Test Interactive Wallet Flows (Optional):** Switch to **Live Ledger & Wallet**, connect MetaMask (auto-adds/switches to GenLayer StudioNet Chain ID `61999`), create a clearance pool, submit a commit-pinned alibi claim, and monitor consensus + Appeal Window progression in **Tx Lifecycle**.

## Expected Outcome
- `deploy/verify_proof.py` exits `0` with `[OK] Verified 6 cases, 3 pools, 4 claims, 1 vague rejections on StudioNet!`.
- Proof Inspector displays `6 / 6` finalized StudioNet transactions matching live RPC state, with verbatim quotes highlighted inside the *Wizard of Oz* and *Dracula* excerpts and Case 6 defending against prompt injection.

## Contract & Proof Explorer Links
- **GitHub Repository:** https://github.com/Kanezar3/Script-Alibi
- **Contract Address:** https://explorer-studio.genlayer.com/address/0x8B5806dfFAfdd9CA429517e60eC37D41b0E2b8A2
- **Deploy Tx:** https://explorer-studio.genlayer.com/tx/0xa78fa991be3dd08587ea14700320c986de70305fd53bd23f816de4f990b3fe64
- **Case 1 (TOO_VAGUE):** https://explorer-studio.genlayer.com/tx/0xa68e9ee41930ab52e760a790eebecd057ade7c018e2ad671a0ef29cd30ab0769
- **Case 2 (CLEARABLE):** https://explorer-studio.genlayer.com/tx/0xdaf0c672b5e98d1c6ac76b37deaa169023ef2e3360c3f8de07ecec2d48aef97e
- **Case 3 (ORIGIN_VERIFIED):** https://explorer-studio.genlayer.com/tx/0x7645910bb5162b32b5e8bea00c6e4e09c81583e01309b6d23264e50aa761169f
- **Case 4 (CONTRADICTED_BY_SOURCE):** https://explorer-studio.genlayer.com/tx/0x2d08c3eda3fcae6a4b6d19cda7c928fbb34195fc021b0ec5f5d701f07c347409
- **Case 5 (INSUFFICIENT_EVIDENCE):** https://explorer-studio.genlayer.com/tx/0xc60322bd13f411616f363764a2ae1a4f569acb0b69951e64b85c92bc64a5c997
- **Case 6 (Prompt-Injection Defense):** https://explorer-studio.genlayer.com/tx/0x9e9d63135e2334675a1174898f47bdf8623a4425f8adede391a91abce623db66
- **Claimant Pull-Withdraw Tx:** https://explorer-studio.genlayer.com/tx/0xb2f8467a69bdf53e685bf6b4373d183fd7eee23167c6ce5982e060823c7251a0
