module aequi::payment {
    use sui::coin::{Coin};
    use sui::sui::SUI;
    use sui::event;
    use std::string::String;

    /// Event emitted to enable the "Message" part of Aequi
    public struct PaymentEvent has copy, drop {
        sender: address,
        recipient: address,
        amount: u64,
        memo: String,
    }

    /// The core function: Sends SUI and attaches a Message (Memo)
    public entry fun send_message_payment(
        payment: Coin<SUI>,
        recipient: address,
        memo: String,
        ctx: &mut TxContext
    ) {
        let amount = sui::coin::value(&payment);
        let sender = tx_context::sender(ctx);

        // Transfer the actual SUI to the recipient
        transfer::public_transfer(payment, recipient);

        // Emit the event so the Aequi SDK can find this transaction later
        event::emit(PaymentEvent {
            sender,
            recipient,
            amount,
            memo,
        });
    }
}