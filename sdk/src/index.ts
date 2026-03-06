import { AEQUI_CONFIG } from './config.js';
import { Transaction } from '@mysten/sui/transactions';

/**
 * PHASE 4: Gas Station Health Check
 * Ensures the sponsor has enough SUI to cover gas.
 */
export async function checkSponsorHealth(client: any, sponsorAddress: string) {
    const coinMetadata = await client.getBalance({
        owner: sponsorAddress,
        coinType: '0x2::sui::SUI',
    });
    
    const balance = BigInt(coinMetadata.totalBalance);
    const minRequired = BigInt(10_000_000); // 0.01 SUI minimum for gas
    
    return {
        isHealthy: balance > minRequired,
        balance: balance.toString()
    };
}

/**
 * Creates a Sponsored Transaction (Gasless for User)
 */
export async function createSponsoredMessageTx(
    senderAddress: string,
    message: string,
    recipient: string,
    amountInMist: number = 100_000_000
) {
    const tx = new Transaction();
    tx.setSender(senderAddress);
    
    const [coin] = tx.splitCoins(tx.gas, [amountInMist]);

    tx.moveCall({
        target: `${AEQUI_CONFIG.PACKAGE_ID}::payment::send_message_payment`,
        arguments: [
            coin,
            tx.pure.address(recipient),
            tx.pure.string(message),
        ],
    });

    return tx;
}

/**
 * Fetches all Aequi PaymentEvents for verification.
 */
export async function getPaymentMessages(client: any) {
    const events = await client.queryEvents({
        query: { MoveEventType: `${AEQUI_CONFIG.PACKAGE_ID}::payment::PaymentEvent` },
    });

    return events.data.map((event: any) => ({
        sender: event.parsedJson.sender,
        recipient: event.parsedJson.recipient,
        amount: event.parsedJson.amount,
        message: event.parsedJson.memo,
        timestamp: event.timestampMs,
        digest: event.id.txDigest
    }));
}