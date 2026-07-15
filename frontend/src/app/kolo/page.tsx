"use client";

import { useEffect, useState } from "react";
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
const KOLO_ADDRESS_KEY = "liber:koloAddress";

export default function KoloPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [koloAddress, setKoloAddress] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setUserId(window.localStorage.getItem("liber:userId"));
    setKoloAddress(window.localStorage.getItem(KOLO_ADDRESS_KEY));
  }, []);

  async function handleConnect(address: string) {
    setError(null);
    if (!StrKey.isValidEd25519PublicKey(address)) {
      setError("Alamat Kolo tidak valid. Pastikan ini alamat Stellar (diawali G).");
      return;
    }
    if (!userId) return;

    setSubmitting(true);
    try {
      await saveKoloAddress(userId, address);
      window.localStorage.setItem(KOLO_ADDRESS_KEY, address);
      setKoloAddress(address);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTopUp() {
    setError(null);
    setSuccess(null);
    const amountUsdc = Number(amountInput);
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      setError("Nominal tidak valid. Masukkan angka lebih dari 0.");
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
        amountUsdc: amountUsdc.toFixed(2),
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      const signedXdr = signXdr(wallet.secretKey, unsignedXdr, NETWORK_PASSPHRASE);
      const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
      const response = await server.submitTransaction(tx);

      await logTopup(userId, { amountUsdc: amountUsdc.toFixed(2), stellarTxHash: response.hash });
      setSuccess(`Berhasil kirim ${amountUsdc.toFixed(2)} USDC ke Kolo.`);
      setAmountInput("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!userId) return null;

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Kolo</h1>

      {!koloAddress ? (
        <Card className="mt-6 flex flex-col gap-4">
          <p className="text-sm text-ink/60">
            Hubungkan alamat Stellar dari akun Kolo kamu. USDC yang kamu kirim ke situ bisa langsung dibelanjakan lewat kartu Kolo yang di-link ke GoPay.
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
                placeholder="Alamat Stellar Kolo (G...)"
                className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
              />
              <Button onClick={() => handleConnect(addressInput)} disabled={submitting || !addressInput}>
                {submitting ? "Menghubungkan..." : "Hubungkan"}
              </Button>
              <Button variant="ghost" onClick={() => setScanning(true)}>
                Scan QR Kolo
              </Button>
            </>
          )}
        </Card>
      ) : (
        <Card className="mt-6 flex flex-col gap-4">
          <p className="text-xs text-ink/50">Terhubung ke Kolo</p>
          <p className="break-all font-mono text-xs text-ink/70">{koloAddress}</p>
          <input
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="Jumlah USDC"
            inputMode="decimal"
            className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
          />
          <Button onClick={handleTopUp} disabled={submitting || !amountInput}>
            {submitting ? "Mengirim..." : "Top up Kolo"}
          </Button>
        </Card>
      )}

      {error && <p className="mt-4 text-center text-sm text-rose">{error}</p>}
      {success && <p className="mt-4 text-center text-sm text-emerald">{success}</p>}
    </PageShell>
  );
}
