import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

export function generateKeypair(): { publicKey: string; secretKey: string } {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secretKey: kp.secret() };
}

export function signXdr(secretKey: string, xdr: string, networkPassphrase: string): string {
  const kp = Keypair.fromSecret(secretKey);
  const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  tx.sign(kp);
  return tx.toXDR();
}
