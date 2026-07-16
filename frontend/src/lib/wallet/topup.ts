import { Account, Asset, Memo, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const BASE_FEE = "10000"; // stroops, generous for mainnet inclusion

export function buildTopUpTx(
  sourceAccount: Account,
  params: { destinationPublicKey: string; amountUsdc: string; networkPassphrase: string; memoId?: string }
): { unsignedXdr: string } {
  const builder = new TransactionBuilder(sourceAccount, { fee: BASE_FEE, networkPassphrase: params.networkPassphrase })
    .addOperation(
      Operation.payment({
        destination: params.destinationPublicKey,
        asset: new Asset("USDC", USDC_ISSUER),
        amount: params.amountUsdc,
      })
    )
    .setTimeout(30);
  if (params.memoId) builder.addMemo(Memo.id(params.memoId));
  const tx = builder.build();
  return { unsignedXdr: tx.toXDR() };
}
