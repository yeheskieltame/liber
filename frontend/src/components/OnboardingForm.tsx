"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { signXdr } from "@/lib/wallet/keypair";
import { createUser, confirmTrustline } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USER_ID_KEY = "liber:userId";

const PROVIDERS = [
  { value: "gopay", label: "GoPay" },
  { value: "dana", label: "DANA" },
  { value: "ovo", label: "OVO" },
  { value: "other", label: "Bank lain" },
] as const;

const inputClass =
  "w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald";

export function OnboardingForm() {
  const router = useRouter();
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["value"]>("gopay");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const form = new FormData(e.currentTarget);
      const idFile = form.get("idFile") as File;
      const idFileBase64 = Buffer.from(await idFile.arrayBuffer()).toString("base64");

      const wallet = await getOrCreateWallet(new LocalStorageWalletStorage());

      const { userId, unsignedTrustlineXdr } = await createUser({
        stellarPublicKey: wallet.publicKey,
        email: String(form.get("email")),
        fullname: String(form.get("fullname")),
        address: String(form.get("address")),
        idNumber: String(form.get("idNumber")),
        idFileBase64,
        bankAccountNumber: String(form.get("bankAccountNumber")),
        bankCode: String(form.get("bankCode")),
        provider,
      });

      const signedXdr = signXdr(wallet.secretKey, unsignedTrustlineXdr, NETWORK_PASSPHRASE);
      await confirmTrustline(userId, signedXdr);

      window.localStorage.setItem(USER_ID_KEY, userId);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <input name="email" type="email" placeholder="Email" required className={inputClass} />
        <input name="fullname" placeholder="Nama lengkap" required className={inputClass} />
        <input name="address" placeholder="Alamat" required className={inputClass} />
        <input name="idNumber" placeholder="NIK" required className={inputClass} />
        <label className="text-xs text-ink/60">
          Foto KTP
          <input name="idFile" type="file" accept="image/*" required className={`${inputClass} mt-1`} />
        </label>

        <div>
          <p className="mb-2 text-xs font-medium text-ink/60">Terima Rupiah lewat</p>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setProvider(p.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  provider === p.value ? "bg-emerald text-white" : "bg-paper text-ink/70"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <input name="bankAccountNumber" placeholder="Nomor rekening/HP" required className={inputClass} />
        <input name="bankCode" placeholder="Kode bank (mis. GOPAY)" required className={inputClass} />
      </Card>

      {error && <p className="text-sm text-rose">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Memproses..." : "Buat akun"}
      </Button>
    </form>
  );
}
