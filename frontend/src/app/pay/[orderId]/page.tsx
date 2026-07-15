"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { signXdr } from "@/lib/wallet/keypair";
import { approveOrder } from "@/lib/api";
import { OrderStatus } from "@/components/OrderStatus";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";

export default function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function approve() {
      try {
        const unsignedXdr = window.sessionStorage.getItem(`liber:pendingBridgeXdr:${orderId}`);
        if (!unsignedXdr) throw new Error("Sesi kadaluarsa, scan ulang QRIS-nya.");

        const wallet = await getOrCreateWallet(new LocalStorageWalletStorage());
        const signedXdr = signXdr(wallet.secretKey, unsignedXdr, NETWORK_PASSPHRASE);
        await approveOrder(orderId, signedXdr);
        setApproved(true);
      } catch (err) {
        setError((err as Error).message);
      }
    }
    approve();
  }, [orderId]);

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Status pembayaran</h1>
      <div className="mt-6">
        {error && <p className="text-center text-sm text-rose">{error}</p>}
        {!error && !approved && <p className="text-center text-sm text-ink/60">Menandatangani transaksi...</p>}
        {!error && approved && <OrderStatus orderId={orderId} />}
      </div>
    </PageShell>
  );
}
