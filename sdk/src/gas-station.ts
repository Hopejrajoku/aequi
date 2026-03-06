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

// --- NEW: ZK PROVER PROXY ---
app.post('/get-prover-proof', async (req, res) => {
    try {
        console.log("⏳ Proxying ZK Proof request to Mysten Labs...");
        const response = await fetch('https://prover.mystenlabs.com/v1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        
        if (!response.ok) {
            console.error("❌ Mysten Prover Error:", data);
            return res.status(response.status).json(data);
        }

        console.log("✅ ZK Proof received from Mysten.");
        res.json(data);
    } catch (error: any) {
        console.error("❌ Prover Proxy Error:", error);
        res.status(500).json({ error: "Failed to reach Prover from backend" });
    }
});

// --- UPDATED: ZK PROVER PROXY USING SHINAMI ---
app.post('/get-prover-proof', async (req, res) => {
    try {
        console.log("⏳ Proxying ZK Proof request to Shinami...");
        
        // Shinami's endpoint is the most stable alternative for Testnet
        const response = await fetch('https://api.shinami.com/zklogin/v1/testnet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error("❌ Shinami Prover Rejected Request:", data);
            return res.status(response.status).json(data);
        }

        console.log("✅ ZK Proof successfully received from Shinami!");
        res.json(data);
    } catch (error: any) {
        console.error("❌ Network Error reaching Shinami:", error.message);
        res.status(500).json({ error: "Prover unreachable. Check your internet connection." });
    }
});

app.listen(3001, () => {
    console.log(`🚀 Aequi Gas Station & Prover Proxy live at http://localhost:3001`);
});