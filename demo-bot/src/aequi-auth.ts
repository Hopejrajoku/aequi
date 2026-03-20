import { generateNonce, generateRandomness, jwtToAddress } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

const client = new SuiJsonRpcClient({ url: 'https://fullnode.testnet.sui.io:443' });
const CLIENT_ID = "1084568422967-5ieemiemnvonf9tbi3r4k7beqvlmdpna.apps.googleusercontent.com";
const REDIRECT_URI = "http://localhost:5173"; 
const SALT = "1234567890123456"; 

export async function startLogin() {
    const { epoch } = await client.getLatestSuiSystemState();
    const maxEpoch = Number(epoch) + 2; 
    const ephemeralKeypair = new Ed25519Keypair();
    const randomness = generateRandomness();

    localStorage.setItem('aequi_ephemeral_pvt', ephemeralKeypair.getSecretKey());
    localStorage.setItem('aequi_randomness', randomness);
    localStorage.setItem('aequi_max_epoch', maxEpoch.toString());

    const nonce = generateNonce(ephemeralKeypair.getPublicKey(), maxEpoch, randomness);
    const params = new URLSearchParams({
        client_id: CLIENT_ID, 
        redirect_uri: REDIRECT_URI, 
        response_type: 'id_token', 
        scope: 'openid email', 
        nonce: nonce,
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function getAequiAddress(idToken: string) {
    // False ensures we use the standard non-legacy Sui address format
    return jwtToAddress(idToken, SALT, false);
}