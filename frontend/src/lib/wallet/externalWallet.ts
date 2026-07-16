let initialized = false;

/**
 * Dynamically imports the wallet-kit SDK instead of a static top-level import. The SDK crashes
 * on module load in some Node versions (it assumes a fully-functional global `localStorage`,
 * which newer Node provides only as an inert stub). A static import would pull that crash into
 * Next.js's SSR pass for every page that (transitively) imports this file; a dynamic import only
 * evaluates the SDK's module code when one of these functions is actually called, which only ever
 * happens client-side, inside a user-triggered event handler.
 */
async function loadKit() {
  const [{ StellarWalletsKit }, { defaultModules }, { Networks }] = await Promise.all([
    import("@creit.tech/stellar-wallets-kit/sdk"),
    import("@creit.tech/stellar-wallets-kit/modules/utils"),
    import("@creit.tech/stellar-wallets-kit/types"),
  ]);
  if (!initialized) {
    StellarWalletsKit.init({ modules: defaultModules(), network: Networks.PUBLIC });
    initialized = true;
  }
  return StellarWalletsKit;
}

/** Opens the wallet-selection modal (Freighter, Albedo, xBull, Lobstr, and others) and returns the connected public key. */
export async function connectExternalWallet(): Promise<string> {
  const kit = await loadKit();
  const { address } = await kit.authModal();
  return address;
}

/** Returns the already-connected wallet's public key, or null if nothing is connected. */
export async function getConnectedExternalAddress(): Promise<string | null> {
  const kit = await loadKit();
  try {
    const { address } = await kit.getAddress();
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
  const kit = await loadKit();
  const { signedTxXdr } = await kit.signTransaction(xdr, { networkPassphrase, address });
  return signedTxXdr;
}

export async function disconnectExternalWallet(): Promise<void> {
  const kit = await loadKit();
  await kit.disconnect();
}
