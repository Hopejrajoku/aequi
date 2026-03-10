import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { AEQUI_CONFIG } from './config.js';

const app = express();
app.use(cors());
app.use(express.json());

const client = new SuiJsonRpcClient({ url: AEQUI_CONFIG.RPC_URL });

function getKeypair(secret: string): Ed25519Keypair {
    if (secret.includes(' ')) return Ed25519Keypair.deriveKeypair(secret);
    const cleanHex = secret.startsWith('0x') ? secret.slice(2) : secret;
    return Ed25519Keypair.fromSecretKey(cleanHex);
}

const secret = process.env.SPONSOR_PRIVATE_KEY;
if (!secret) throw new Error("SPONSOR_PRIVATE_KEY missing in .env");
const sponsorKeypair = getKeypair(secret);

/**
 * --- FINAL AUTHENTICATED SHINAMI PROVER PROXY ---
 * Target: Shinami US-1 ZK Prover Hub
 */
app.post('/get-prover-proof', async (req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        console.log("⏳ Proxying ZK Proof request to Shinami US-1 Prover...");

        /**
         * FINAL SCHEMA MAPPING (LEAN MVP):
         * 1. Swapped 'randomness' -> 'jwtRandomness' (Confirmed by server rejection).
         * 2. Using 'keyClaimName' (Confirmed by previous trace).
         * 3. All numeric values explicitly cast to String.
         */
        const shinamiPayload = {
            jsonrpc: "2.0",
            id: 1,
            method: "shinami_zkp_createZkLoginProof", 
            params: {
                jwt: String(req.body.jwt),
                maxEpoch: String(req.body.maxEpoch),
                extendedEphemeralPublicKey: String(req.body.extendedEphemeralPublicKey),
                salt: String(req.body.salt),
                jwtRandomness: String(req.body.jwtRandomness), // Key changed to match US-1 Hub
                keyClaimName: "sub" 
            }
        };

        const response = await fetch('https://api.us1.shinami.com/sui/zkprover/v1', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': 'us1_sui_testnet_9823727156a6473fba7e59afdc5246b9', 
                'Connection': 'keep-alive'
            },
            body: JSON.stringify(shinamiPayload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log(`📡 Shinami Status: ${response.status} ${response.statusText}`);

        const rawText = await response.text();
        const data = JSON.parse(rawText);

        if (data.error) {
            console.error("❌ Shinami Logic Error:", JSON.stringify(data.error, null, 2));
            return res.status(400).json(data.error);
        }

        console.log("✅ ZK Proof successfully received!");
        res.json(data.result);

    } catch (error: any) {
        clearTimeout(timeoutId);
        console.error("❌ Fatal Proxy Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/sponsor', async (req, res) => {
    try {
        console.log("⛽ Sponsoring transaction...");
        const { txBytes } = req.body;
        const uint8Array = new Uint8Array(Buffer.from(txBytes, 'base64'));
        const { signature } = await sponsorKeypair.signTransaction(uint8Array);
        console.log("✅ Sponsorship signature generated.");
        res.json({ signature });
    } catch (e: any) {
        console.error("❌ Sponsorship Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 Aequi Gas Station live at http://localhost:${PORT}`);
});