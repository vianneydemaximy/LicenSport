import xrpl from "xrpl";
const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
await client.connect();
const { wallet: alice } = await client.fundWallet();
const { wallet: bob } = await client.fundWallet();
const tx = await client.autofill({
  TransactionType: "Payment",
  Account: alice.address,
  Destination: bob.address,
  Amount: xrpl.xrpToDrops("10"),
  Memos: [{ Memo: { MemoData: xrpl.convertStringToHex("demo-001") } }],
});
const signed = alice.sign(tx);
const res = await client.submitAndWait(signed.tx_blob);
console.log(res.result.meta.TransactionResult, signed.hash);
console.log("Alice :", alice.address, "→ Bob :", bob.address);
await client.disconnect();
