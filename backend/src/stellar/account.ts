import {
  Account,
  Asset,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const NETWORK_PASSPHRASE = () => process.env.STELLAR_NETWORK_PASSPHRASE!;
const HORIZON_URL = () => process.env.HORIZON_URL ?? "https://horizon.stellar.org";
const USDC = () => new Asset("USDC", process.env.USDC_ISSUER!);
const BASE_FEE = "10000"; // stroops, generous for mainnet inclusion

function server() {
  return new Horizon.Server(HORIZON_URL());
}

export function buildOnboardingTxFromAccount(
  sourceAccount: Account,
  fundingSecret: string,
  newAccountPublicKey: string,
  startingBalanceXlm: string
): { signedXdr: string } {
  const funding = Keypair.fromSecret(fundingSecret);
  const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE() })
    .addOperation(Operation.createAccount({ destination: newAccountPublicKey, startingBalance: startingBalanceXlm }))
    .setTimeout(30)
    .build();
  tx.sign(funding);
  return { signedXdr: tx.toXDR() };
}

export async function buildOnboardingTx(params: {
  fundingSecret: string;
  newAccountPublicKey: string;
  startingBalanceXlm: string;
}): Promise<{ signedXdr: string }> {
  const funding = Keypair.fromSecret(params.fundingSecret);
  const sourceAccount = await server().loadAccount(funding.publicKey());
  return buildOnboardingTxFromAccount(sourceAccount, params.fundingSecret, params.newAccountPublicKey, params.startingBalanceXlm);
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
