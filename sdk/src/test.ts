import 'dotenv/config';
import { createSponsoredMessageTx, getPaymentMessages, checkSponsorHealth } from './index.js';
import { AEQUI_CONFIG } from './config.js';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

async function runTest() {
    try {
        const client = new SuiJsonRpcClient({ url: AEQUI_CONFIG.RPC_URL });

        // 1. Setup Keys
        const userSecret = process.env.SUI_PRIVATE_KEY;
        const sponsorSecret = process.env.SPONSOR_PRIVATE_KEY;
        if (!userSecret || !sponsorSecret) throw new Error("Keys missing in .env");

        const userKeypair = userSecret.includes(' ') 
            ? Ed25519Keypair.deriveKeypair(userSecret) 
            : Ed25519Keypair.fromSecretKey(userSecret.replace('0x', ''));

        const sponsorKeypair = sponsorSecret.includes(' ')
            ? Ed25519Keypair.deriveKeypair(sponsorSecret)
            : Ed25519Keypair.fromSecretKey(sponsorSecret.replace('0x', ''));

        const userAddress = userKeypair.getPublicKey().toSuiAddress();
        const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress();

        console.log(`👤 User: ${userAddress}`);
        console.log(`⛽ Sponsor: ${sponsorAddress}`);

        // 2. Pre-flight Gas Station Check
        const health = await checkSponsorHealth(client, sponsorAddress);
        if (!health.isHealthy) {
            console.error(`❌ GAS STATION EMPTY! Balance: ${health.balance} MIST`);
            console.log("Please send Testnet SUI to the Sponsor address above.");
            return;
        }
        console.log(`✅ Gas Station Healthy (Balance: ${health.balance} MIST)`);

        // 3. Build & Sponsor
        console.log("⏳ Building sponsored transaction...");
        const tx = await createSponsoredMessageTx(userAddress, "Aequi: Verified Sponsored Pay", userAddress);

        // Required: Set gas budget and fetch gas coins for the sponsor
        tx.setGasOwner(sponsorAddress);
        
        const txBytes = await tx.build({ client });

        // Dual signing
        const { signature: userSig } = await userKeypair.signTransaction(txBytes);
        const { signature: sponsorSig } = await sponsorKeypair.signTransaction(txBytes);

        // 4. Execution
        console.log("🚀 Executing with Sponsor Coverage...");
        const result = await client.executeTransactionBlock({
            transactionBlock: txBytes,
            signature: [userSig, sponsorSig],
            options: { showEffects: true },
        });

        console.log(`✅ SUCCESS! Digest: ${result.digest}`);

    } catch (error) {
        console.error("❌ Sponsoring Failed:", error);
    }
}

runTest();