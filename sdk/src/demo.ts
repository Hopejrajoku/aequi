import 'dotenv/config';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { AEQUI_CONFIG } from './config.js';
import { checkSponsorHealth } from './index.js';

// Helper to handle Mnemonic or Private Key string
function getKeypair(secret: string): Ed25519Keypair {
    if (secret.includes(' ')) {
        return Ed25519Keypair.deriveKeypair(secret);
    }
    // Remove 0x if present for hex strings
    const cleanHex = secret.startsWith('0x') ? secret.slice(2) : secret;
    return Ed25519Keypair.fromSecretKey(cleanHex);
}

async function runMasterDemo() {
    try {
        const client = new SuiJsonRpcClient({ url: AEQUI_CONFIG.RPC_URL });

        const userSecret = process.env.SUI_PRIVATE_KEY;
        const sponsorSecret = process.env.SPONSOR_PRIVATE_KEY;
        if (!userSecret || !sponsorSecret) throw new Error("Check your .env keys!");

        const userKeypair = getKeypair(userSecret);
        const sponsorKeypair = getKeypair(sponsorSecret);

        const userAddress = userKeypair.getPublicKey().toSuiAddress();
        const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress();

        console.log("🌊 AEQUI MASTER DEMO: INVISIBLE FINANCE");
        console.log(`👤 User: ${userAddress}`);
        console.log(`⛽ Sponsor: ${sponsorAddress}`);

        // Check Sponsor Balance
        const health = await checkSponsorHealth(client, sponsorAddress);
        console.log(`📡 Gas Station Status: ${health.isHealthy ? '🟢 READY' : '🔴 EMPTY'}`);
        if (!health.isHealthy) return;

        // Build Sponsored Transaction
        const tx = new Transaction();
        tx.setSender(userAddress);
        tx.setGasOwner(sponsorAddress); 

        const [coin] = tx.splitCoins(tx.gas, [100_000_000]); // 0.1 SUI
        tx.moveCall({
            target: `${AEQUI_CONFIG.PACKAGE_ID}::payment::send_message_payment`,
            arguments: [
                coin,
                tx.pure.address(userAddress), 
                tx.pure.string("Aequi Master Demo: Phase 4 & 5 Logic"),
            ],
        });

        console.log("⏳ Building & Signing...");
        const txBytes = await tx.build({ client });
        
        const { signature: userSig } = await userKeypair.signTransaction(txBytes);
        const { signature: sponsorSig } = await sponsorKeypair.signTransaction(txBytes);

        const result = await client.executeTransactionBlock({
            transactionBlock: txBytes,
            signature: [userSig, sponsorSig],
            options: { showEffects: true },
        });

        console.log("✅ SUCCESS! Transaction Sponsored.");
        console.log(`🔗 Explorer: https://testnet.suivision.xyz/txblock/${result.digest}`);

    } catch (error) {
        console.error("❌ Demo Failed:", error);
    }
}

runMasterDemo();