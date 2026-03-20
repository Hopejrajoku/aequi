import { startLogin, getAequiAddress } from './aequi-auth';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { genAddressSeed } from '@mysten/sui/zklogin';
import { AequiClient } from './aequi-client';

// Declare confetti for TS if not using a @types package
declare var confetti: any;

/**
 * CONFIGURATION
 */
const aequi = new AequiClient({
    shinamiNodeUrl: 'https://api.us1.shinami.com/sui/node/v1?apikey=us1_sui_testnet_9823727156a6473fba7e59afdc5246b9',
    fallbackNodeUrl: 'https://fullnode.testnet.sui.io:443',
    gasStationUrl: 'http://localhost:3001'
});

const SALT = "1234567890123456"; 

/**
 * Helper to compute address seed for the ZK signature
 */
function computeAddressSeed(idToken: string, salt: string): string {
    const parts = idToken.split('.');
    const payload = JSON.parse(atob(parts[1]));
    return genAddressSeed(BigInt(salt), "sub", payload.sub, payload.aud).toString();
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
            
            // PHASE C: HIGH-END CREATOR PROFILE UI
            statusDiv.innerHTML = `
                <div class="aequi-card">
                    <div class="profile-pic">H</div>
                    <div class="creator-name">Hope-Jr Ajoku</div>
                    <div class="creator-bio">Building the future of "Money as a Message"</div>
                    
                    <div class="input-group">
                        <span class="input-label">Support Message</span>
                        <input type="text" id="msg-input" class="aequi-input" value="Aequi: Money as a Message">
                    </div>
                    
                    <button id="send-btn" class="btn-send">
                        <span id="btn-text">Support with $1</span>
                    </button>
                    <div id="receipt-area"></div>
                </div>
            `;

            document.getElementById('send-btn')!.onclick = () => {
                const msg = (document.getElementById('msg-input') as HTMLInputElement).value;
                handleSponsoredTransaction(userAddress, msg, idToken);
            };
        } catch (e) { 
            console.error("Initialization Error:", e); 
        }
    }
    
    if (loginBtn) {
        loginBtn.onclick = () => startLogin();
    }
});

async function handleSponsoredTransaction(userAddress: string, message: string, idToken: string) {
    const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
    const btnText = document.getElementById('btn-text') as HTMLElement;
    const receiptArea = document.getElementById('receipt-area') as HTMLDivElement;
    
    try {
        // 1. UI: LOADING STATE (The "Invisible" Spinner)
        sendBtn.disabled = true;
        btnText.innerHTML = '<div class="spinner"></div>';
        receiptArea.innerHTML = ''; // Clear previous errors

        // 2. SESSION PREP
        const ephemeralPvt = localStorage.getItem('aequi_ephemeral_pvt');
        const randomness = localStorage.getItem('aequi_randomness');
        const maxEpoch = localStorage.getItem('aequi_max_epoch');
        
        if (!ephemeralPvt || !randomness || !maxEpoch) throw new Error("Session expired.");
        const ephemeralKeypair = Ed25519Keypair.fromSecretKey(ephemeralPvt);

        // 3. BUILD TRANSACTION
        const tx = new Transaction();
        tx.setSender(userAddress);

        const [coin] = tx.splitCoins(tx.gas, [10_000_000]); 
        tx.moveCall({
            target: `0xcaf2c355986b04ffb2478f345bacd96ed59b65782f80be2a8cb39b3d2a342307::payment::send_message_payment`,
            arguments: [coin, tx.pure.address(userAddress), tx.pure.string(message)],
        });

        tx.setGasBudget(50_000_000); 
        tx.setGasOwner("0x7bb58bb4bb9fcbc26b6766c8a767acdbb68dd48f793adbf0b9f960233906ef74");

        const addressSeed = computeAddressSeed(idToken, SALT);

        // 4. EXECUTE VIA SDK
        const result = await aequi.executeGasless({
            tx,
            idToken: idToken.trim(),
            ephemeralKeyPair: ephemeralKeypair,
            maxEpoch: Number(maxEpoch),
            randomness: randomness,
            salt: SALT,
            addressSeed: addressSeed
        });

        // 5. SUCCESS: THE BIG REVEAL (Confetti + Clean UI)
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#007bff', '#1a1a1a', '#ffffff']
        });

        sendBtn.style.background = "#28a745";
        btnText.innerHTML = "Success!";
        
        receiptArea.innerHTML = `
            <p style="font-size:12px; margin-top:16px;">
                <a href="https://testnet.suivision.xyz/txblock/${result.digest}" target="_blank" style="color:#999; text-decoration:none;">
                    View Blockchain Receipt ↗
                </a>
            </p>
        `;
        
        console.log("Aequi Success:", result.digest);

    } catch (error: any) {
        // RESET UI ON ERROR
        sendBtn.disabled = false;
        sendBtn.style.background = "#dc3545";
        btnText.innerHTML = "Try Again";
        receiptArea.innerHTML = `<div style="color:red; font-size:12px; margin-top:10px;">❌ ${error.message}</div>`;
        console.error("TX FAILED:", error);
    }
}