# í¼Š Aequi: Money as a Message
### *The Next-Gen On-Chain Payment Infrastructure on Sui*

**Aequi** is a high-performance, developer-first SDK and payment protocol built on the Sui Network. It abstracts the complexity of programmable transactions into a human-readable "Message" format, allowing for seamless value transfer coupled with intent.

## í³– Table of Contents
* [Vision](#-vision)
* [Project Structure](#-project-structure)
* [Core Features](#-core-features)
* [Technical Setup](#-technical-setup)
* [SDK Usage](#-sdk-usage)
* [Troubleshooting (Node v24 Issues)](#-troubleshooting-node-v24-issues)
* [Roadmap](#-roadmap)
* [Contributing](#-contributing)

## í¾¯ Vision
**Aequi** (Latin for *Equal/Fair*) aims to bridge the gap between traditional messaging and financial settlement. By leveraging Sui's object-centric model, we treat every payment as a unique data object that carries metadata, ensuring that **"The Message is the Money."**

## í¿— Project Structure
This repository is organized as a monorepo to separate concerns between the core engine and implementation bots.

```text
aequi/
â”œâ”€â”€ sdk/              # The Core TypeScript Engine
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ config.ts # Network & Contract Constants
â”‚   â”‚   â”œâ”€â”€ index.ts  # Transaction Builders
â”‚   â”‚   â””â”€â”€ test.ts   # Integration Test Suite
â”‚   â””â”€â”€ package.json  # SDK Dependencies (Sui v2.6.0)
â”œâ”€â”€ demo-bot/         # Implementation Example
â””â”€â”€ Move/             # Smart Contract Source (Sui Move)
```

## íº€ Core Features
* **Atomic Move Calls:** Single-click execution of the `send_message_payment` function.
* **Node v24 Optimized:** Fully compatible with the latest ESM loaders using dynamic import strategies.
* **Typed Configurations:** Centralized management of Package IDs and RPC endpoints.
* **Stateless Transaction Building:** Build transactions locally and sign/execute them only when ready.

## í²» Technical Setup
### Prerequisites
* **Node.js:** v24.12.0 or higher (LTS recommended)
* **Sui CLI:** For contract management and keypair exports.
* **Runner:** `tsx` is used to handle TypeScript execution without a heavy build step.

### Installation
```bash
# Install dependencies for the SDK
cd sdk
npm install

# Setup environment variables
cp .env.example .env
```

### Environment Variables
The SDK requires a `.env` file in the `sdk/` directory:
```bash
SUI_PRIVATE_KEY=your_base64_or_hex_key
```

## í»  SDK Usage
Aequi uses a **Dynamic Discovery Pattern** to ensure compatibility with modern JavaScript runtimes (ESM).

### Initializing a Transaction
```typescript
import { createMessagePaymentTx } from './sdk/src/index.js';

const tx = await createMessagePaymentTx(
    "Hello from Aequi!", 
    "0x_recipient_address"
);
```

## í´§ Troubleshooting (Node v24 Issues)
If you encounter `TypeError: SuiClient is not a constructor`, the Aequi SDK handles this by using **Explicit Namespace Extraction**:

```typescript
// The Aequi Way (Fail-safe for Node v24 ESM)
const clientModule = await import('@mysten/sui/client');
const SuiClient = clientModule.SuiClient;
```
This bypasses the ESM/CommonJS interop bugs present in the latest Node loaders.

## í·º Roadmap
- [x] **Phase 1:** Core Move Contract (Payment Module).
- [x] **Phase 2:** TypeScript SDK Hardening (Node v24 Support).
- [ ] **Phase 3:** Next.js Merchant Dashboard.
- [ ] **Phase 4:** Mainnet Alpha Launch.

## í´ Contributing
1. **Branch** from `main`.
2. Ensure `npm test` passes in the `sdk/` directory.
3. **Submit a PR** with a detailed description of the changes.

**Built with í²™ for the Sui Ecosystem.**
