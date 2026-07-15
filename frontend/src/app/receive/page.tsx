"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";

export default function ReceivePage() {
  const [address, setAddress] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getOrCreateWallet(new LocalStorageWalletStorage()).then(async (wallet) => {
      setAddress(wallet.publicKey);
      setQrDataUrl(await QRCode.toDataURL(wallet.publicKey));
    });
  }, []);

  if (!address) return <p className="mt-8 text-center text-sm text-ink/60">Memuat alamat...</p>;

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Terima USDC</h1>
      <Card className="mt-6 flex flex-col items-center gap-4 text-center">
        <div className="rounded-3xl bg-ink p-4">
          {qrDataUrl && <img src={qrDataUrl} alt="Alamat Stellar" width={200} height={200} />}
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
          {copied ? "Tersalin." : "Salin alamat"}
        </Button>
        <p className="text-xs text-ink/40">
          Kirim USDC (Stellar) ke alamat ini. Saldo muncul di halaman utama setelah transaksi selesai.
        </p>
      </Card>
    </PageShell>
  );
}
