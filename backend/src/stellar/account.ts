import { Account, Asset, Horizon, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const NETWORK_PASSPHRASE = () => process.env.STELLAR_NETWORK_PASSPHRASE!;
const HORIZON_URL = () => process.env.HORIZON_URL ?? "https://horizon.stellar.org";
const USDC = () => new Asset("USDC", process.env.USDC_ISSUER!);
const BASE_FEE = "10000"; // stroops, generous for mainnet inclusion

export const ACTIVATION_BALANCE_XLM = 2; // matches the account's own reserve + USDC trustline reserve + a small fee buffer for the user's own future transactions

function server() {
  return new Horizon.Server(HORIZON_URL());
}

export async function getNativeBalance(
  publicKey: string,
  fetchAccount: (pk: string) => Promise<{ balances: { asset_type: string; balance: string }[] }> = (pk) =>
    server().loadAccount(pk)
): Promise<string | null> {
  try {
    const account = await fetchAccount(publicKey);
    return account.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
    throw err;
  }
}

export function isActivated(nativeBalanceXlm: string | null): boolean {
  return nativeBalanceXlm !== null && Number(nativeBalanceXlm) >= ACTIVATION_BALANCE_XLM;
}

export function buildTrustlineTxFromAccount(sourceAccount: Account): { unsignedXdr: string } {
  const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE() })
    .addOperation(Operation.changeTrust({ asset: USDC() }))
    .setTimeout(30)
    .build();
  return { unsignedXdr: tx.toXDR() };
}

export async function buildTrustlineTx(params: { accountPublicKey: string }): Promise<{ unsignedXdr: string }> {
  const sourceAccount = await server().loadAccount(params.accountPublicKey);
  return buildTrustlineTxFromAccount(sourceAccount);
}

export async function submitStellarTx(signedXdr: string): Promise<{ hash: string }> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE());
  const response = await server().submitTransaction(tx);
  return { hash: response.hash };
}
