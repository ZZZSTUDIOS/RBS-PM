/**
 * Test x402 Create Market Flow
 *
 * This script:
 * 1. Creates an x402 payment (signed USDC TransferWithAuthorization)
 * 2. Calls the x402-create-market endpoint with the payment
 * 3. Lists the market in Supabase
 */

import { createPublicClient, createWalletClient, http, encodePacked, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Monad Testnet
const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'Monad', symbol: 'MON' },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
} as const;

// Config
const USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3';
const PROTOCOL_RECIPIENT = '0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE';
const CREATE_MARKET_PRICE = '100000'; // 0.10 USDC
const API_URL = 'https://qkcytrdhdtemyphsswou.supabase.co/functions/v1/x402-create-market';

// EIP-712 domain for USDC TransferWithAuthorization
const USDC_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 10143,
  verifyingContract: USDC as `0x${string}`,
} as const;

// TransferWithAuthorization types
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    console.error('PRIVATE_KEY environment variable required');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log('Sender:', account.address);

  const walletClient = createWalletClient({
    chain: monadTestnet,
    transport: http(),
    account,
  });

  // Create payment payload
  const now = Math.floor(Date.now() / 1000);
  const nonce = keccak256(toHex(Date.now())); // Random nonce

  const payload = {
    from: account.address,
    to: PROTOCOL_RECIPIENT,
    value: CREATE_MARKET_PRICE,
    validAfter: (now - 60).toString(), // Valid from 1 minute ago
    validBefore: (now + 3600).toString(), // Valid for 1 hour
    nonce: nonce,
  };

  console.log('\nPayment payload:', payload);

  // Sign the TransferWithAuthorization message
  const signature = await walletClient.signTypedData({
    domain: USDC_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: PROTOCOL_RECIPIENT as `0x${string}`,
      value: BigInt(CREATE_MARKET_PRICE),
      validAfter: BigInt(now - 60),
      validBefore: BigInt(now + 3600),
      nonce: nonce,
    },
  });

  console.log('Signature:', signature);

  // Build x402 header
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const x402Header = `x402 1:eip155:10143:${payloadB64}:${signature}`;

  console.log('\nX-Payment header:', x402Header.slice(0, 100) + '...');

  // Market data to create
  const marketData = {
    address: '0x49c3fD5394254001dd32b2BA24b0d6B4AA0256d2',
    question: 'Will Bitcoin reach $150k by end of 2026?',
    resolutionTime: 1798761600,
    oracle: '0x87C965003e62b7E6a5E3462391E827544Cf0985a',
    yesTokenAddress: '0x13AF7e3b0B124e4EF6F14198B223204152eD706B',
    noTokenAddress: '0xD57BF62c9e603E142946F4B7834cA16A85467bb6',
    initialLiquidity: '1',
    alpha: '0.03',
    category: 'crypto',
    tags: ['bitcoin', 'price'],
  };

  console.log('\nMarket data:', marketData);

  // Call the x402 endpoint
  console.log('\nCalling x402-create-market...');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment': x402Header,
    },
    body: JSON.stringify(marketData),
  });

  const result = await response.json();
  console.log('\nResponse status:', response.status);
  console.log('Response:', JSON.stringify(result, null, 2));

  if (response.status === 201) {
    console.log('\n✅ Market created successfully via x402!');
  } else {
    console.log('\n❌ Failed to create market');
  }
}

main().catch(console.error);
