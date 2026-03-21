// @ts-nocheck
import { startLogin, getAequiAddress } from './aequi-auth';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { genAddressSeed } from '@mysten/sui/zklogin';
import { AequiClient } from './aequi-client';

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
const AEQUI_PACKAGE_ID = "0x987ce1380aece8aee903af49a11dcff9f075837afcb98a82687e9d387e3fcaab";

/**
 * HELPER: Compute ZK Address Seed
 */
function computeAddressSeed(idToken: string, salt: string): string {
    const parts = idToken.split('.');
    const payload = JSON.parse(atob(parts[1]));
    return genAddressSeed(BigInt(salt), "sub", payload.sub, payload.aud).toString();
}

/**
 * UI: Refresh the Live Ledger
 */
async function refreshSupportLedger() {
    const ledgerDiv = document.getElementById('ledger-content');
    if (!ledgerDiv) return;

    const query = {
        query: { MoveModule: { package: AEQUI_PACKAGE_ID, module: 'payment' } },
        limit: 10,
        order: 'descending' as const
    };

    try {
        const events = await (aequi as any).fallbackClient.queryEvents(query);
        if (!events || events.data.length === 0) {
            ledgerDiv.innerHTML = '<p style="color:#999; font-size:12px;">No support messages yet.</p>';
            return;
        }

        let html = '<table style="width:100%; font-size:11px; margin-top:10px; border-collapse: collapse;">';
        events.data.forEach((e: any) => {
            const data = e.parsedJson;
            const sender = data.sender || "0x...";
            const shortSender = `${sender.slice(0, 6)}...${sender.slice(-4)}`;
            const msg = data.message_ref || "View on Explorer";
            const displayMsg = msg.length > 25 ? msg.slice(0, 22) + '...' : msg;
            
            html += `<tr style="border-bottom:1px solid #fafafa; height:35px;">
                        <td style="font-family:monospace; color:#444;">${shortSender}</td>
                        <td style="color:#007bff; font-weight:600;">"${displayMsg}"</td>
                     </tr>`;
        });
        html += '</table>';
        ledgerDiv.innerHTML = html;
    } catch (err) {
        ledgerDiv.innerHTML = '<p style="color:red; font-size:10px;">Indexer lagging.</p>';
    }
}

/**
 * TRANSACTION HANDLER
 */
async function handleSponsoredTransaction(userAddress: string, message: string, idToken: string) {
    const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
    const btnText = document.getElementById('btn-text') as HTMLElement;
    const receiptArea = document.getElementById('receipt-area') as HTMLDivElement;
    
    try {
        sendBtn.disabled = true;
        btnText.innerHTML = '<div class="spinner"></div>';
        receiptArea.innerHTML = '<p style="font-size:10px; color:#666;">Syncing with Walrus...</p>';

        const blobId = await aequi.storeOnWalrus(message);

        const ephemeralPvt = localStorage.getItem('aequi_ephemeral_pvt');
        if (!ephemeralPvt) throw new Error("Session expired.");

        let ephemeralKeypair: Ed25519Keypair;
        if (ephemeralPvt.startsWith('suiprivkey')) {
            const { secretKey } = decodeSuiPrivateKey(ephemeralPvt);
            ephemeralKeypair = Ed25519Keypair.fromSecretKey(secretKey);
        } else {
            ephemeralKeypair = Ed25519Keypair.fromSecretKey(Uint8Array.from(JSON.parse(ephemeralPvt)));
        }

        const tx = new Transaction();
        tx.setSender(userAddress);
        const [coin] = tx.splitCoins(tx.gas, [10_000_000]); 
        
        tx.moveCall({
            target: `${AEQUI_PACKAGE_ID}::payment::send_message_payment`,
            arguments: [coin, tx.pure.address(userAddress), tx.pure.string(blobId)],
        });

        tx.setGasBudget(30_000_000); 
        tx.setGasOwner("0x7bb58bb4bb9fcbc26b6766c8a767acdbb68dd48f793adbf0b9f960233906ef74");

        const result = await aequi.executeGasless({
            tx,
            idToken: idToken.trim(),
            ephemeralKeyPair: ephemeralKeypair,
            maxEpoch: Number(localStorage.getItem('aequi_max_epoch')),
            randomness: localStorage.getItem('aequi_randomness'),
            salt: SALT,
            addressSeed: computeAddressSeed(idToken, SALT)
        });

        if (typeof confetti !== 'undefined') confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        sendBtn.disabled = false;
        btnText.innerHTML = "Success!";
        receiptArea.innerHTML = `<a href="https://testnet.suivision.xyz/txblock/${result.digest}" target="_blank">View Receipt ↗</a>`;
        
        setTimeout(refreshSupportLedger, 3000);
    } catch (error: any) {
        sendBtn.disabled = false;
        btnText.innerHTML = "Try Again";
        receiptArea.innerHTML = `<div style="color:red; font-size:11px;">❌ ${error.message}</div>`;
    }
}

/**
 * INITIALIZATION ENGINE
 */
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const statusDiv = document.getElementById('status');
    
    // Check if we are returning from Google OAuth
    const urlParams = new URLSearchParams(window.location.hash.slice(1));
    const idToken = urlParams.get('id_token');

    if (idToken) {
        try {
            const userAddress = getAequiAddress(idToken);
            if (loginBtn) loginBtn.style.display = 'none';
            
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

                    <div id="support-ledger" style="margin-top:25px; text-align:left; border-top:1px solid #eee; padding-top:15px;">
                        <h4 style="margin:0; font-size:12px; color:#333; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Recent Support</h4>
                        <div id="ledger-content">Loading live feed...</div>
                    </div>
                </div>
            `;

            refreshSupportLedger();

            document.getElementById('send-btn')!.onclick = () => {
                const msg = (document.getElementById('msg-input') as HTMLInputElement).value;
                handleSponsoredTransaction(userAddress, msg, idToken);
            };
        } catch (e) {
            console.error("Auth initialization failed", e);
        }
    }

    // Attach click listener to the login button (Crucial fix)
    if (loginBtn) {
        loginBtn.onclick = () => {
            console.log("Redirecting to Google...");
            startLogin();
        };
    }
});