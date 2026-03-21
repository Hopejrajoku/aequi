module aequi::payment {
    use sui::coin::{Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::transfer; // Added explicit use
    use sui::tx_context::{Self, TxContext}; // Added explicit use
    use std::string::String;

    /// Event emitted with the link to decentralized storage
    public struct PaymentEvent has copy, drop {
        sender: address,
        recipient: address,
        amount: u64,
        walrus_blob_id: String, // Semantically updated
    }

    /// The core function: Transfers SUI and anchors a Walrus Blob ID
    public entry fun send_message_payment(
        payment: Coin<SUI>,
        recipient: address,
        walrus_blob_id: String,
        ctx: &mut TxContext
    ) {
        let amount = sui::coin::value(&payment);
        let sender = tx_context::sender(ctx);

        // Transfer the actual SUI to the recipient (Creator)
        transfer::public_transfer(payment, recipient);

        // Emit the event to link the transaction to the Walrus data
        event::emit(PaymentEvent {
            sender,
            recipient,
            amount,
            walrus_blob_id,
        });
    }
}