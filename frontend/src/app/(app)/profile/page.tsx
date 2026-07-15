"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Account, StrKey, Horizon, TransactionBuilder } from "@stellar/stellar-sdk";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { QrScanner } from "@/components/QrScanner";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { signXdr } from "@/lib/wallet/keypair";
import { buildTopUpTx } from "@/lib/wallet/topup";
import { saveKoloAddress, logTopup } from "@/lib/api";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USER_ID_KEY = "liber:userId";
const KOLO_ADDRESS_KEY = "liber:koloAddress";

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const [koloAddress, setKoloAddress] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setUserId(window.localStorage.getItem(USER_ID_KEY));
    setKoloAddress(window.localStorage.getItem(KOLO_ADDRESS_KEY));
    getOrCreateWallet(new LocalStorageWalletStorage()).then(async (wallet) => {
      setAddress(wallet.publicKey);
      setQrDataUrl(await QRCode.toDataURL(wallet.publicKey));
    });
  }, []);

  function handleConnect(value: string) {
    setError(null);
    if (!StrKey.isValidEd25519PublicKey(value)) {
      setError("Invalid Kolo address. It should be a Stellar address starting with G.");
      return;
    }

    window.localStorage.setItem(KOLO_ADDRESS_KEY, value);
    setKoloAddress(value);
    if (userId) saveKoloAddress(userId, value).catch((err) => console.error("failed to save Kolo address", err));
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
    if (!userId || !koloAddress) return;

    setSubmitting(true);
    try {
      const wallet = await getOrCreateWallet(new LocalStorageWalletStorage());
      const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org";
      const server = new Horizon.Server(horizonUrl);
      const accountResponse = await server.loadAccount(wallet.publicKey);
      const sourceAccount = new Account(accountResponse.accountId(), accountResponse.sequenceNumber());

      const { unsignedXdr } = buildTopUpTx(sourceAccount, {
        destinationPublicKey: koloAddress,
        amountUsdc: amountUsdcRounded,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      const signedXdr = signXdr(wallet.secretKey, unsignedXdr, NETWORK_PASSPHRASE);
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

      {!koloAddress ? (
        <Card className="mt-3 flex flex-col gap-4">
          <p className="text-sm text-ink/60">
            Connect your Kolo Stellar address. USDC sent there can be spent immediately through your Kolo card linked to GoPay.
          </p>
          {scanning ? (
            <QrScanner
              onScan={(text) => {
                setScanning(false);
                handleConnect(text);
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
              <Button onClick={() => handleConnect(addressInput)} disabled={!addressInput}>
                Connect
              </Button>
              <Button variant="ghost" onClick={() => setScanning(true)}>
                Scan Kolo QR
              </Button>
            </>
          )}
        </Card>
      ) : (
        <Card className="mt-3 flex flex-col gap-4">
          <p className="break-all font-mono text-xs text-ink/50">{koloAddress}</p>
          <input
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="Amount (USDC)"
            inputMode="decimal"
            className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
          />
          <Button onClick={handleTopUp} disabled={submitting || !amountInput}>
            {submitting ? "Sending..." : "Top Up Kolo"}
          </Button>
        </Card>
      )}

      {error && <p className="mt-4 text-center text-sm text-rose">{error}</p>}
      {success && <p className="mt-4 text-center text-sm text-emerald">{success}</p>}
    </PageShell>
  );
}
