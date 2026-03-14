import 'dotenv/config';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

function getKeypair(secret: string): Ed25519Keypair {
    if (secret.startsWith('suiprivkey')) {
        const { secretKey } = decodeSuiPrivateKey(secret);
        return Ed25519Keypair.fromSecretKey(secretKey);
    }
    if (secret.includes(' ')) return Ed25519Keypair.deriveKeypair(secret);
    const cleanHex = secret.startsWith('0x') ? secret.slice(2) : secret;
    return Ed25519Keypair.fromSecretKey(cleanHex);
}

async function splitGas() {
    const client = new SuiJsonRpcClient({ url: 'https://fullnode.testnet.sui.io:443' });
    const secret = process.env.SPONSOR_PRIVATE_KEY;
    if (!secret) throw new Error("SPONSOR_PRIVATE_KEY missing in .env");

    const keypair = getKeypair(secret);
    const sponsorAddress = keypair.toSuiAddress();
    
    console.log("🛠️  Fragmenting gas for:", sponsorAddress);

    const tx = new Transaction();
    tx.setSender(sponsorAddress);

    // 1. Define the split amounts (10 coins of 0.1 SUI)
    const amounts = Array(10).fill(100_000_000); 
    
    // 2. Perform the split
    const coins = tx.splitCoins(tx.gas, amounts);
    
    // 3. Transfer each new coin to yourself
    // We loop to ensure we handle the objects correctly for your SDK version
    amounts.forEach((_, index) => {
        tx.transferObjects([coins[index]], tx.pure.address(sponsorAddress));
    });

    const txBytes = await tx.build({ client });
    const { signature } = await keypair.signTransaction(txBytes);

    const result = await client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [signature],
        options: { showEffects: true }
    });

    console.log("------------------------------------------");
    console.log("✅ Success! Gas fragmented.");
    console.log("Digest:", result.digest);
    console.log("------------------------------------------");
}

splitGas().catch((err) => console.error("❌ Split Failed:", err.message));