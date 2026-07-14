# contracts/ — deferred: Passkey Kit integration

**Status: not active for v1.** See `docs/superpowers/specs/2026-07-15-liber-architecture-design.md` §10.1.

v1 of Liber uses a plain Stellar Ed25519 keypair generated client-side in `frontend/` (`frontend/src/lib/wallet/`), not a Passkey Kit smart wallet. Two upstream blockers make Passkey Kit unbuildable today:

1. **Passkey Kit's smart-wallet contract is not deployed to Stellar mainnet.** Per the project's own deployment manifest (verified 2026-07-15): "Mainnet: Not deployed. A mainnet upload will be recorded in a follow-up manifest." It's only live on testnet.
2. **Allbridge Core (the Stellar↔Base bridge) has no testnet route** for this pair — its SDK ships a `mainnet` config only (the sole chain with a testnet env in the SDK is Sui).

Since the bridge+IDRX leg can only run on mainnet, and the passkey wallet only exists on testnet, the two can't be chained into one flow yet. Rather than block the MVP on an upstream release, v1 skips this folder's active build; the plain-keypair wallet in `frontend/` covers the same non-custodial signing boundary (backend never sees a private key) without needing WebAuthn.

## Fast-follow: what to do once Passkey Kit ships mainnet

Re-check the deployment manifest at [github.com/kalepail/passkey-kit `docs/deployments-mainnet-*.md`](https://github.com/kalepail/passkey-kit) — once it exists, integration is:

1. **Pin the mainnet WASM hash** for the smart-wallet contract (same shape as the testnet manifest — verified 2026-07-15):
   - Testnet (for reference/dev): `walletWasmHash = fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0`
   - Mainnet: TBD once published.
2. **Set up fee sponsorship via a relayer.** Passkey Kit's `PasskeyServer` submits through a relayer (OpenZeppelin's managed "Channels" service is what the SDK's own docs/constants point at):
   - `CHANNELS_TESTNET_URL = https://channels.openzeppelin.com/testnet`
   - `CHANNELS_MAINNET_URL = https://channels.openzeppelin.com`
   - Requires signing up for a relayer API key (separate account setup, not yet done for this project).
3. **Swap `frontend/src/lib/wallet/` for the Passkey Kit browser SDK** (`PasskeyKit.createWallet()`/`connectWallet()`/`sign()`), and add a small server-side call to `PasskeyServer.send()` in `backend/` for relayed submission — this replaces `signXdr()` (Task 2 of the frontend plan) call sites, not the API contract between frontend and backend (orders/users routes stay the same shape).
4. **Fund the wallet's deployer** — Passkey Kit wallets deploy from a canonical deterministic deployer keypair (`Keypair.fromRawEd25519Seed(sha256(utf8("kalepail")))`); this only pays deploy fees and never controls the wallet, but confirm the relayer covers it before assuming it's free.

## Why no Soroban contract work is planned here at all

Passkey Kit's smart-wallet WASM is uploaded once by the Passkey Kit project itself; every user wallet deploys its own instance of that same existing, audited contract (no factory contract to deploy, no custom contract logic needed for this product). There is nothing to write in Rust/Soroban for Liber's MVP — this folder's job, even once activated, is integration config and a smoke-test script, not contract development.
