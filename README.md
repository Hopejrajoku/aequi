# Aequi: Money as a Message
The Lean MVP Infrastructure for Seamless On-Chain Payments

Version: 1.0.0

Network: Sui Testnet

License: ISC

## Table of Contents
Executive Summary

Core Philosophy

Architecture Overview

Tech Stack

Prerequisites

Installation

Environment Configuration

Module Breakdown

Usage Guide

Troubleshooting (Node v24+)

Roadmap

## Executive Summary
Aequi is a high-performance TypeScript SDK designed to abstract the complexities of the Sui blockchain into a human-centric payment experience. Instead of dealing with raw hex data and complex move-calls, Aequi allows developers to treat a financial transaction as a "Message"—coupling value transfer with intent.

## Core Philosophy
Lean MVP: Focus only on the essential "Send Message" primitive to achieve immediate market validation.

Zero-Guesswork Integration: Designed specifically for the ESM-heavy environments of modern 2026 runtimes (Node v24+).

Developer Experience (DX): Standardized configuration to prevent "Address Sprawl" across multiple files.

## Architecture Overview
The SDK acts as a bridge between your local environment (or future Frontend) and the Aequi Move Smart Contract deployed on the Sui Testnet.

Key Components:

Config Layer: Centralized constants (Package ID, RPC URLs).

Logic Layer (index.ts): Stateless transaction builders that return Transaction objects.

Execution Layer (test.ts): State-aware signing and broadcasting logic.

## Tech Stack
Language: TypeScript 5.9.3+

Runtime: Node.js v24.12.0

Runner: tsx (TypeScript Execute)

Blockchain SDK: @mysten/sui v2.6.0

Environment Management: dotenv

## Prerequisites
Before running the SDK, ensure you have:

Sui CLI installed and an active Testnet address.

Testnet SUI tokens (Get them from the Sui Discord or Faucet).

Your Private Key (Exported from sui keytool export <address>).

## Installation
Bash
# Clone the repository
git clone https://github.com/your-username/aequi-sdk.git
cd aequi-sdk

# Install dependencies
npm install

# Install the runner (if not already present)
npm install --save-dev tsx
### Environment Configuration
Create a .env file in the root directory:

Code snippet
# Your Sui Private Key (Base64 or Hex)
SUI_PRIVATE_KEY=your_private_key_here
Security Note: Never commit your .env file. It is included in .gitignore by default.

## Module Breakdown
1. src/config.ts

The heartbeat of the SDK. Update the PACKAGE_ID whenever you redeploy your Move contract.

TypeScript
export const AEQUI_CONFIG = {
    PACKAGE_ID: "0xcaf2c355986b04ffb2478f345bacd96ed59b65782f80be2a8cb39b3d2a342307",
    MODULE_NAME: "payment",
    FUNCTION_NAME: "send_message_payment",
    NETWORK: "testnet",
    RPC_URL: "https://fullnode.testnet.sui.io:443"
};
2. src/index.ts

The transaction builder. It abstracts the moveCall structure so you don't have to remember the argument order.

3. src/test.ts

The integration test suite. It handles keypair hydration, gas budgeting, and transaction broadcasting.

### Usage Guide
Running the Test Suite

To verify that the SDK is successfully communicating with the blockchain:

Bash
npm test
Expected Output:

Plaintext
🚀 Authenticated: 0xYourAddress...
⏳ Building transaction...
⏳ Sending to Sui Testnet...
✅ SUCCESS! Aequi is Live.
Transaction Digest: 8zH...9abc
🔗 Explorer: https://testnet.suivision.xyz/txblock/8zH...
⚠️ Troubleshooting (Node v24+)
Node v24 introduced strict ESM resolution. If you encounter TypeError: SuiClient is not a constructor or SyntaxError:

Use Dynamic Imports: This SDK uses await import() to ensure compatibility with Node's loader.

Explicit Destructuring: Always extract classes directly from the module object:

TypeScript
const clientModule = await import('@mysten/sui/client');
const SuiClient = clientModule.SuiClient;
File Extensions: Always include .js in local imports (e.g., import { x } from './config.js').

### Roadmap
[x] Phase 1: Core Move Contract (Payment Module).

[x] Phase 2: TypeScript SDK (Transaction Abstraction).

[ ] Phase 3: Next.js Merchant Dashboard (UI/UX).

[ ] Phase 4: Mainnet Deployment 
