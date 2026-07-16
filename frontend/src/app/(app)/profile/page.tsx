"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { Account, StrKey, Horizon, TransactionBuilder } from "@stellar/stellar-sdk";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { QrScanner } from "@/components/QrScanner";
import { getActiveWallet, signActiveWallet, type ActiveWallet } from "@/lib/wallet/activeWallet";
import { buildTopUpTx } from "@/lib/wallet/topup";
import { saveKoloAddress, logTopup } from "@/lib/api";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USER_ID_KEY = "liber:userId";
const KOLO_ADDRESS_KEY = "liber:koloAddress";
const KOLO_MEMO_KEY = "liber:koloMemo";

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<ActiveWallet | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const [koloAddress, setKoloAddress] = useState<string | null>(null);
  const [koloMemo, setKoloMemo] = useState<string | null>(null);
  const [editingKolo, setEditingKolo] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [memoInput, setMemoInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setUserId(window.localStorage.getItem(USER_ID_KEY));
    setKoloAddress(window.localStorage.getItem(KOLO_ADDRESS_KEY));
    setKoloMemo(window.localStorage.getItem(KOLO_MEMO_KEY));
    getActiveWallet().then(async (activeWallet) => {
      setWallet(activeWallet);
      setAddress(activeWallet.publicKey);
      setQrDataUrl(await QRCode.toDataURL(activeWallet.publicKey));
    });
  }, []);

  function handleConnect(addressValue: string, memoValue: string) {
    setError(null);
    if (!StrKey.isValidEd25519PublicKey(addressValue)) {
      setError("Invalid Kolo address. It should be a Stellar address starting with G.");
      return;
    }
    if (!/^\d+$/.test(memoValue)) {
      setError("Invalid Kolo memo. It should be the numeric memo Kolo gave you for your account.");
      return;
    }

    window.localStorage.setItem(KOLO_ADDRESS_KEY, addressValue);
    window.localStorage.setItem(KOLO_MEMO_KEY, memoValue);
    setKoloAddress(addressValue);
    setKoloMemo(memoValue);
    setEditingKolo(false);
    if (userId)
      saveKoloAddress(userId, addressValue, memoValue).catch((err) => console.error("failed to save Kolo address", err));
  }

  function handleStartEditKolo() {
    setError(null);
    setAddressInput(koloAddress ?? "");
    setMemoInput(koloMemo ?? "");
    setEditingKolo(true);
  }

  async function handleTopUp() {
    setError(null);
    setSuccess(null);
    const amountUsdc = Number(amountInput);
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      setError("Invalid amount. Enter a number greater than 0.");
      return;
    }
    const amountUsdcRounded = (Math.floor(amountUsdc * 100) / 100).toFixed(2);
    if (Number(amountUsdcRounded) <= 0) {
      setError("Amount too small. Minimum is 0.01 USDC.");
      return;
    }
    if (!userId || !koloAddress || !wallet) return;

    setSubmitting(true);
    try {
      const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org";
      const server = new Horizon.Server(horizonUrl);
      const accountResponse = await server.loadAccount(wallet.publicKey);
      const sourceAccount = new Account(accountResponse.accountId(), accountResponse.sequenceNumber());

      const { unsignedXdr } = buildTopUpTx(sourceAccount, {
        destinationPublicKey: koloAddress,
        amountUsdc: amountUsdcRounded,
        networkPassphrase: NETWORK_PASSPHRASE,
        memoId: koloMemo ?? undefined,
      });
      const signedXdr = await signActiveWallet(wallet, unsignedXdr, NETWORK_PASSPHRASE);
      const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
      const response = await server.submitTransaction(tx);

      await logTopup(userId, { amountUsdc: amountUsdcRounded, stellarTxHash: response.hash });
      setSuccess(`Sent ${amountUsdcRounded} USDC to Kolo.`);
      setAmountInput("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Profile</h1>

      <Card className="mt-6 flex flex-col items-center gap-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Your Wallet</p>
        {address ? (
          <>
            <div className="rounded-3xl bg-ink p-4">
              {qrDataUrl && <img src={qrDataUrl} alt="Stellar address" width={160} height={160} />}
            </div>
            <p className="break-all rounded-2xl bg-paper px-4 py-3 font-mono text-xs text-ink/70">{address}</p>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy Address"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-ink/60">Loading address...</p>
        )}
      </Card>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink/50">Kolo Card</p>

      {!koloAddress && (
        <Card className="mt-3 flex flex-col gap-4 bg-emerald/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-deep">New to Kolo?</p>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                <Image src="/logos/kolo-logo.png" alt="Kolo" width={26} height={26} className="rounded-full" />
              </span>
              <p className="text-sm text-ink/70">
                <span className="font-semibold text-ink">1. Sign up for Kolo.</span> Get your card and its Stellar
                deposit address.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center gap-0.5 rounded-full bg-white shadow-sm">
                <Image src="/logos/gopay-logo.png" alt="GoPay" width={16} height={16} className="object-contain" />
                <Image src="/logos/dana-logo.png" alt="DANA" width={16} height={16} className="rounded object-contain" />
              </span>
              <p className="text-sm text-ink/70">
                <span className="font-semibold text-ink">2. Link the card.</span> In GoPay or DANA, add that Kolo
                Visa card under payment methods.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald text-white shadow-sm">
                <span className="font-display text-sm italic">3</span>
              </span>
              <p className="text-sm text-ink/70">
                <span className="font-semibold text-ink">Connect here.</span> Paste or scan the Kolo address below.
              </p>
            </div>
          </div>

          <a
            href="https://kolo.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-sm font-semibold text-emerald underline underline-offset-4"
          >
            Sign up at kolo.xyz
          </a>
        </Card>
      )}

      {!koloAddress || editingKolo ? (
        <Card className="mt-3 flex flex-col gap-4">
          <p className="text-sm text-ink/60">
            Connect your Kolo Stellar address and the numeric memo from your Kolo account. USDC sent there can be
            spent immediately through your Kolo card linked to GoPay or DANA.
          </p>
          {scanning ? (
            <QrScanner
              onScan={(text) => {
                setScanning(false);
                setAddressInput(text);
              }}
              onError={setError}
            />
          ) : (
            <>
              <input
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Kolo Stellar address (G...)"
                className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
              />
              <input
                value={memoInput}
                onChange={(e) => setMemoInput(e.target.value)}
                placeholder="Kolo memo (numeric)"
                inputMode="numeric"
                className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
              />
              <Button onClick={() => handleConnect(addressInput, memoInput)} disabled={!addressInput || !memoInput}>
                Connect
              </Button>
              <Button variant="ghost" onClick={() => setScanning(true)}>
                Scan Kolo QR
              </Button>
              {koloAddress && (
                <Button variant="ghost" onClick={() => setEditingKolo(false)}>
                  Cancel
                </Button>
              )}
            </>
          )}
        </Card>
      ) : (
        <Card className="mt-3 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="break-all font-mono text-xs text-ink/50">{koloAddress}</p>
              <p className="font-mono text-xs text-ink/50">Memo: {koloMemo}</p>
            </div>
            <button
              type="button"
              onClick={handleStartEditKolo}
              className="shrink-0 text-xs font-semibold text-emerald underline underline-offset-4"
            >
              Edit
            </button>
          </div>
          <input
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="Amount (USDC)"
            inputMode="decimal"
            className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
          />
          <Button onClick={handleTopUp} disabled={submitting || !amountInput || !wallet}>
            {submitting ? "Sending..." : "Top Up Kolo"}
          </Button>
        </Card>
      )}

      {error && <p className="mt-4 text-center text-sm text-rose">{error}</p>}
      {success && <p className="mt-4 text-center text-sm text-emerald">{success}</p>}
    </PageShell>
  );
}
