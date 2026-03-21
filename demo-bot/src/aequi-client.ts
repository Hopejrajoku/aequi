// @ts-nocheck
import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getZkLoginSignature } from '@mysten/sui/zklogin';

export class AequiClient {
    public client: SuiJsonRpcClient;
    public fallbackClient: SuiJsonRpcClient;
    private gasStationUrl: string;
    private walrusUrl: string;

    constructor(config: any) {
        this.client = new SuiJsonRpcClient({ url: config.shinamiNodeUrl });
        this.fallbackClient = new SuiJsonRpcClient({ url: config.fallbackNodeUrl });
        this.gasStationUrl = config.gasStationUrl;
        
        // Testnet publisher endpoint
        this.walrusUrl = "https://publisher.walrus.testnet.walrus.site/v1/store";
    }

    async storeOnWalrus(content: string): Promise<string> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);

            const response = await fetch(`${this.walrusUrl}?epochs=5`, {
                method: "PUT",
                body: content,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`Walrus HTTP ${response.status}`);
            
            const data = await response.json();
            const blobId = data.newlyCreated?.blobObject?.blobId || data.alreadyCertified?.blobId;
            
            if (!blobId) throw new Error("No blobId found");
            return blobId;
        } catch (e) {
            console.warn("Walrus unreachable. Using raw message fallback.");
            // Returning content directly so the transaction doesn't break
            return content; 
        }
    }

    async executeGasless(params: any) {
        const { tx, idToken, ephemeralKeyPair, maxEpoch, randomness, salt, addressSeed } = params;

        // 1. ZK Proof Request
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

        // 2. High Availability Build Logic
        let txBytes;
        let activeClient = this.client;
        try {
            txBytes = await tx.build({ client: this.client });
        } catch (e) {
            console.warn("Primary Node Fail (likely 401). Falling back...");
            txBytes = await tx.build({ client: this.fallbackClient });
            activeClient = this.fallbackClient;
        }

        const base64Tx = btoa(String.fromCharCode(...new Uint8Array(txBytes)));

        // 3. Sponsorship Request
        const sponsorRes = await fetch(`${this.gasStationUrl}/sponsor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txBytes: base64Tx })
        });
        const sponsorData = await sponsorRes.json();
        if (!sponsorData.signature) throw new Error("Sponsorship failed");

        // 4. Multi-Signature Assembly
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

        // 5. Execution
        return await activeClient.executeTransactionBlock({
            transactionBlock: txBytes,
            signature: [zkLoginSig, sponsorData.signature],
            options: { showEffects: true, showEvents: true },
        });
    }
}