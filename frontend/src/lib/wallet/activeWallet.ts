import { getOrCreateWallet, LocalStorageWalletStorage, type WalletStorage } from "./storage";
import { signXdr } from "./keypair";
import { getConnectedExternalAddress, signWithExternalWallet, disconnectExternalWallet } from "./externalWallet";

const WALLET_MODE_KEY = "liber:wallet:mode";

export type ActiveWallet =
  | { mode: "local"; publicKey: string; secretKey: string }
  | { mode: "external"; publicKey: string };

export function getWalletMode(): "local" | "external" {
  return window.localStorage.getItem(WALLET_MODE_KEY) === "external" ? "external" : "local";
}

export function setExternalWalletMode(): void {
  window.localStorage.setItem(WALLET_MODE_KEY, "external");
}

export function setLocalWalletMode(): void {
  window.localStorage.setItem(WALLET_MODE_KEY, "local");
}

export async function getActiveWallet(
  storage: WalletStorage = new LocalStorageWalletStorage(),
  getExternalAddress: () => Promise<string | null> = getConnectedExternalAddress
): Promise<ActiveWallet> {
  if (getWalletMode() === "external") {
    const publicKey = await getExternalAddress();
    if (publicKey) return { mode: "external", publicKey };
    // The user was in external mode but nothing is actually connected anymore
    // (e.g. they revoked access in their wallet) - fall back to a local wallet
    // rather than getting stuck.
  }
  const wallet = await getOrCreateWallet(storage);
  return { mode: "local", publicKey: wallet.publicKey, secretKey: wallet.secretKey };
}

export async function signActiveWallet(
  wallet: ActiveWallet,
  xdr: string,
  networkPassphrase: string,
  signExternal: (xdr: string, address: string, networkPassphrase: string) => Promise<string> = signWithExternalWallet
): Promise<string> {
  if (wallet.mode === "external") {
    return signExternal(xdr, wallet.publicKey, networkPassphrase);
  }
  return signXdr(wallet.secretKey, xdr, networkPassphrase);
}

export async function disconnectAndSwitchToLocal(
  disconnect: () => Promise<void> = disconnectExternalWallet
): Promise<void> {
  await disconnect();
  setLocalWalletMode();
}
