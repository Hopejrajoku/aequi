import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getZkLoginSignature } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export interface AequiConfig {
    shinamiNodeUrl: string;
    fallbackNodeUrl: string;
    gasStationUrl: string;
}

export class AequiClient {
    private client: SuiJsonRpcClient;
    private fallbackClient: SuiJsonRpcClient;
    private gasStationUrl: string;

    constructor(config: AequiConfig) {
        this.client = new SuiJsonRpcClient({ url: config.shinamiNodeUrl });
        this.fallbackClient = new SuiJsonRpcClient({ url: config.fallbackNodeUrl });
        this.gasStationUrl = config.gasStationUrl;
    }

    /**
     * The "Magic" function. 
     * Handles proof, sponsorship, signing, and submission in one call.
     */
    async executeGasless(params: {
        tx: Transaction,
        idToken: string,
        ephemeralKeyPair: Ed25519Keypair,
        maxEpoch: number,
        randomness: string,
        salt: string,
        addressSeed: string
    }) {
        const { tx, idToken, ephemeralKeyPair, maxEpoch, randomness, salt, addressSeed } = params;

        // 1. Fetch ZK Proof from your backend
        const zkRes = await fetch(`${this.gasStationUrl}/get-prover-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jwt: idToken,
                extendedEphemeralPublicKey: ephemeralKeyPair.getPublicKey().toBase64(),
                maxEpoch,
                jwtRandomness: randomness,
                salt
            })
        });
        const rawData = await zkRes.json();
        const proof = rawData.zkProof || rawData.result || rawData;

        // 2. Build Transaction with fallback logic
        let txBytes;
        let activeClient = this.client;
        try {
            txBytes = await tx.build({ client: this.client });
        } catch (e) {
            console.warn("Aequi: Falling back to public RPC...");
            txBytes = await tx.build({ client: this.fallbackClient });
            activeClient = this.fallbackClient;
        }

        const base64Tx = btoa(String.fromCharCode(...new Uint8Array(txBytes)));

        // 3. Get Sponsorship
        const sponsorRes = await fetch(`${this.gasStationUrl}/sponsor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txBytes: base64Tx })
        });
        const sponsorData = await sponsorRes.json();
        if (!sponsorData.signature) throw new Error("Aequi: Sponsorship rejected.");

        // 4. Combine Signatures
        const { signature: userSig } = await ephemeralKeyPair.signTransaction(txBytes);
        const zkLoginSig = getZkLoginSignature({
            inputs: {
                proofPoints: proof.proofPoints,
                issBase64Details: proof.issBase64Details,
                headerBase64: proof.headerBase64,
                addressSeed
            },
            maxEpoch,
            userSignature: userSig,
        });

        // 5. Submit
        return await activeClient.executeTransactionBlock({
            transactionBlock: txBytes,
            signature: [zkLoginSig, sponsorData.signature],
            options: { showEffects: true },
        });
    }
}