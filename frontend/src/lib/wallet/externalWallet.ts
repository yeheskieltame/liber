import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";

let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  StellarWalletsKit.init({ modules: defaultModules(), network: Networks.PUBLIC });
  initialized = true;
}

/** Opens the wallet-selection modal (Freighter, Albedo, xBull, Lobstr, and others) and returns the connected public key. */
export async function connectExternalWallet(): Promise<string> {
  ensureInit();
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

/** Returns the already-connected wallet's public key, or null if nothing is connected. */
export async function getConnectedExternalAddress(): Promise<string | null> {
  ensureInit();
  try {
    const { address } = await StellarWalletsKit.getAddress();
    return address;
  } catch {
    return null;
  }
}

export async function signWithExternalWallet(
  xdr: string,
  address: string,
  networkPassphrase: string
): Promise<string> {
  ensureInit();
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, { networkPassphrase, address });
  return signedTxXdr;
}

export async function disconnectExternalWallet(): Promise<void> {
  ensureInit();
  await StellarWalletsKit.disconnect();
}
