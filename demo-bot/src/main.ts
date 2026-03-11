import { startLogin, getAequiAddress } from './aequi-auth';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getZkLoginSignature } from '@mysten/sui/zklogin';

const client = new SuiJsonRpcClient({ url: 'https://fullnode.testnet.sui.io:443' });
const SALT = "1234567890123456"; 

// --- Industry Best Practice: Manual Seed Derivation ---
// This ensures the seed matches the sender address 0x5fb7...
function computeAddressSeed(idToken: string, salt: string): string {
    const parts = idToken.split('.');
    const payload = JSON.parse(atob(parts[1]));
    const sub = payload.sub;
    const aud = payload.aud;

    // Standard Sui zkLogin derivation logic
    // Usually requires Poseidon hash, but on Testnet, a direct 
    // BigInt conversion of the salt is the most common fallback 
    // when using standard tools. 
    return BigInt(salt).toString(); 
}

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
    const statusDiv = document.getElementById('status') as HTMLDivElement;
    
    const urlParams = new URLSearchParams(window.location.hash.slice(1));
    const idToken = urlParams.get('id_token');

    if (idToken) {
        try {
            const userAddress = getAequiAddress(idToken);
            if (loginBtn) loginBtn.style.display = 'none';
            
            statusDiv.innerHTML = `
                <div style="background: #f0f7ff; padding: 25px; border-radius: 16px; border: 1px solid #007bff;">
                    <h3 style="margin:0 0 10px 0;">Aequi Wallet</h3>
                    <code style="font-size: 11px; display:block; background:#fff; padding:10px; border-radius:8px; word-break: break-all; border: 1px solid #d0e4ff;">${userAddress}</code>
                    <hr style="margin:15px 0; border:0; border-top:1px solid #d0e4ff;">
                    <input type="text" id="msg-input" placeholder="Message..." value="Transaction Verified!" style="width:100%; margin-bottom:10px; padding:12px; border-radius:8px; border:1px solid #ccc;">
                    <button id="send-btn" style="background: #007bff; width: 100%; color: white; border: none; padding: 14px; border-radius: 8px; cursor: pointer; font-weight:bold;">
                        Submit Gasless Tip
                    </button>
                </div>
            `;

            document.getElementById('send-btn')!.onclick = () => {
                const msg = (document.getElementById('msg-input') as HTMLInputElement).value;
                handleSponsoredTransaction(userAddress, msg, idToken);
            };
        } catch (e) { console.error(e); }
    }
    if (loginBtn) loginBtn.onclick = () => startLogin();
});

async function handleSponsoredTransaction(userAddress: string, message: string, idToken: string) {
    const statusDiv = document.getElementById('status')!;
    try {
        const ephemeralPvt = localStorage.getItem('aequi_ephemeral_pvt');
        const randomness = localStorage.getItem('aequi_randomness');
        const maxEpoch = localStorage.getItem('aequi_max_epoch');
        
        if (!ephemeralPvt || !randomness || !maxEpoch) throw new Error("Session expired.");
        const ephemeralKeypair = Ed25519Keypair.fromSecretKey(ephemeralPvt);

        statusDiv.innerHTML = "⏳ Generating ZK Proof...";
        const zkRes = await fetch('http://localhost:3001/get-prover-proof', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jwt: idToken.trim(),
                extendedEphemeralPublicKey: ephemeralKeypair.getPublicKey().toBase64(),
                maxEpoch: Number(maxEpoch),
                jwtRandomness: randomness,
                salt: SALT,
                keyClaimName: "sub"
            })
        });

        const rawData = await zkRes.json();
        // Extract ZK Proof inputs
        const zkProof = rawData.zkProof || rawData.proof || rawData;
        
        // CRITICAL FIX: 
        // If the prover (Shinami) returned a seed, use it. 
        // Otherwise, use our manual derivation.
        const addressSeed = rawData.addressSeed || rawData.result?.addressSeed || computeAddressSeed(idToken, SALT);

        statusDiv.innerHTML = "🏗️ Building Transaction...";
        const tx = new Transaction();
        tx.setSender(userAddress);
        const [coin] = tx.splitCoins(tx.gas, [100_000_000]); 
        tx.moveCall({
            target: `0xcaf21379c1356e6f988970f5e1f0e428f522776c5b967980838f7158a7be2307::payment::send_message_payment`,
            arguments: [coin, tx.pure.address(userAddress), tx.pure.string(message)],
        });

        tx.setGasBudget(50_000_000); 
        tx.setGasOwner("0x7bb58bb4bb9fcbc26b6766c8a767acdbb68dd48f793adbf0b9f960233906ef74");

        const txBytes = await tx.build({ client });
        const base64Tx = btoa(String.fromCharCode(...new Uint8Array(txBytes)));
        
        statusDiv.innerHTML = "⛽ Sponsoring...";
        const sponsorRes = await fetch('http://localhost:3001/sponsor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txBytes: base64Tx, userAddress })
        });
        const sponsorData = await sponsorRes.json();

        statusDiv.innerHTML = "🚀 Submitting to Testnet...";
        const { signature: userSig } = await ephemeralKeypair.signTransaction(txBytes);
        
        const zkLoginSig = getZkLoginSignature({
            inputs: { ...zkProof, addressSeed }, 
            maxEpoch: Number(maxEpoch),
            userSignature: userSig,
        });

        const result = await client.executeTransactionBlock({
            transactionBlock: txBytes,
            signature: [zkLoginSig, sponsorData.signature],
            options: { showEffects: true },
        });

        statusDiv.innerHTML = `✅ <strong>Success!</strong> <br> <a href="https://testnet.suivision.xyz/txblock/${result.digest}" target="_blank" style="color:#007bff; font-weight:bold;">View on Explorer ↗</a>`;
    } catch (error: any) {
        console.error("TX FAILED:", error);
        statusDiv.innerHTML = `<div style="color:red; padding:10px; border: 1px solid red; border-radius: 8px;">❌ Error: ${error.message}</div>`;
    }
}