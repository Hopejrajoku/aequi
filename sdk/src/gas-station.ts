import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const app = express();
app.use(cors());
app.use(express.json());

// Multi-RPC Setup for Hydra Relay Strategy (Lean MVP)
const client = new SuiJsonRpcClient({ url: 'https://fullnode.testnet.sui.io:443' });

/**
 * Utility to derive keypair from .env
 */
function getKeypair(secret: string): Ed25519Keypair {
    if (secret.includes(' ')) return Ed25519Keypair.deriveKeypair(secret);
    const cleanHex = secret.startsWith('0x') ? secret.slice(2) : secret;
    return Ed25519Keypair.fromSecretKey(cleanHex);
}

const secret = process.env.SPONSOR_PRIVATE_KEY;
if (!secret) throw new Error("SPONSOR_PRIVATE_KEY missing in .env");
const sponsorKeypair = getKeypair(secret);

/**
 * 1. ZK Prover Proxy
 * Calls Shinami and ensures data integrity via forced serialization.
 */
app.post('/get-prover-proof', async (req, res) => {
    try {
        console.log("⏳ Requesting ZK Proof from Shinami...");

        const response = await fetch('https://api.us1.shinami.com/sui/zkprover/v1', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': 'us1_sui_testnet_9823727156a6473fba7e59afdc5246b9'
            },
            body: JSON.stringify({
                jsonrpc: "2.0", 
                id: 1,
                method: "shinami_zkp_createZkLoginProof", 
                params: {
                    jwt: String(req.body.jwt),
                    maxEpoch: String(req.body.maxEpoch),
                    extendedEphemeralPublicKey: String(req.body.extendedEphemeralPublicKey),
                    salt: String(req.body.salt),
                    jwtRandomness: String(req.body.jwtRandomness),
                    keyClaimName: "sub" 
                }
            })
        });

        const data = await response.json();

        if (data.error || !data.result) {
            console.error("❌ Shinami Error:", data.error);
            return res.status(400).json(data.error || { message: "No result from Shinami" });
        }

        console.log("✅ ZK Proof Received. Keys:", Object.keys(data.result));
        
        // --- CRITICAL FIX: Forced Serialization ---
        // Prevents Express/Node from mangling BigInt proof points
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(data.result));

    } catch (error: any) {
        console.error("❌ Proxy Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 2. Sponsorship Signer
 * Signs transaction bytes for the frontend to enable gasless UX.
 */
app.post('/sponsor', async (req, res) => {
    try {
        const { txBytes } = req.body;
        if (!txBytes) return res.status(400).json({ error: "Missing txBytes" });

        const uint8Array = new Uint8Array(Buffer.from(txBytes, 'base64'));
        const { signature } = await sponsorKeypair.signTransaction(uint8Array);
        
        console.log("⛽ Transaction Sponsored successfully.");
        res.json({ signature });
    } catch (error: any) {
        console.error("❌ Sponsorship Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 Aequi Gas Station live at http://localhost:${PORT}`);
    console.log(`Sponsor Address: ${sponsorKeypair.getPublicKey().toSuiAddress()}`);
});