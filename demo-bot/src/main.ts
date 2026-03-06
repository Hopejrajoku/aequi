import { startLogin, getAequiAddress } from './aequi-auth';
import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getZkLoginSignature } from '@mysten/sui/zklogin';

const client = new SuiJsonRpcClient({ url: 'https://fullnode.testnet.sui.io:443' });
const SALT = "1234567890123456"; 

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
    const statusDiv = document.getElementById('status') as HTMLDivElement;
    const urlParams = new URLSearchParams(window.location.hash.slice(1));
    const idToken = urlParams.get('id_token');

    if (idToken) {
        const userAddress = getAequiAddress(idToken);
        loginBtn.style.display = 'none';
        statusDiv.innerHTML = `
            <div style="background: #f0f7ff; padding: 20px; border-radius: 12px; border: 1px solid #007bff;">
                <p>✅ <strong>Wallet Active</strong></p>
                <code style="font-size: 10px; display:block; background:#fff; padding:5px; border-radius:4px; word-break: break-all;">${userAddress}</code>
                <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
                <input type="text" id="msg-input" placeholder="Enter tip message..." style="width:100%; margin-bottom:10px; padding:10px; border-radius:6px; border:1px solid #ccc;">
                <button id="send-btn" style="background: #007bff; width: 100%; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight:bold;">
                    Send Gasless Tip
                </button>
            </div>
        `;
        document.getElementById('send-btn')?.addEventListener('click', () => {
            const msg = (document.getElementById('msg-input') as HTMLInputElement).value;
            handleSponsoredTransaction(userAddress, msg, idToken);
        });
    }

    loginBtn.addEventListener('click', startLogin);
});

async function handleSponsoredTransaction(userAddress: string, message: string, idToken: string) {
    const statusDiv = document.getElementById('status')!;
    
    try {
        const ephemeralPvt = localStorage.getItem('aequi_ephemeral_pvt');
        const randomness = localStorage.getItem('aequi_randomness');
        const maxEpoch = localStorage.getItem('aequi_max_epoch');
        
        if (!ephemeralPvt || !randomness || !maxEpoch) throw new Error("Session expired.");
        const ephemeralKeypair = Ed25519Keypair.fromSecretKey(ephemeralPvt);

        // --- STEP 1: FETCH ZK PROOF VIA LOCAL PROXY ---
        statusDiv.innerHTML = "⏳ Generating ZK Proof (via Local Proxy)...";
        
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

        if (!zkRes.ok) {
            const errData = await zkRes.json();
            throw new Error(`Prover Error: ${errData.message || 'Check Server Console'}`);
        }
        const zkProof = await zkRes.json();

        // --- STEP 2: BUILD TRANSACTION ---
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

        // --- STEP 3: SPONSOR ---
        statusDiv.innerHTML = "⛽ Requesting Gas...";
        const sponsorRes = await fetch('http://localhost:3001/sponsor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txBytes: base64Tx, userAddress })
        });
        const data = await sponsorRes.json();

        // --- STEP 4: SIGN & EXECUTE ---
        statusDiv.innerHTML = "🚀 Executing on Sui...";
        const { signature: userSig } = await ephemeralKeypair.signTransaction(txBytes);
        
        const zkLoginSig = getZkLoginSignature({
            inputs: zkProof,
            maxEpoch: Number(maxEpoch),
            userSignature: userSig,
        });

        const result = await client.executeTransactionBlock({
            transactionBlock: txBytes,
            signature: [zkLoginSig, data.signature],
            options: { showEffects: true },
        });

        statusDiv.innerHTML = `✅ <strong>Success!</strong> <br> <a href="https://testnet.suivision.xyz/txblock/${result.digest}" target="_blank" style="color:#007bff; font-weight:bold;">View on Explorer ↗</a>`;
    } catch (error: any) {
        statusDiv.innerHTML = `<span style="color:red;">❌ Error: ${error.message}</span><br><button onclick="location.reload()" style="margin-top:10px;">Retry</button>`;
        console.error("TX FAILED:", error);
    }
}