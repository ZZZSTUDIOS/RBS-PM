/**
 * Test x402 Create Market Flow
 *
 * Uses the official @x402 packages to create a properly formatted payment
 */

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { wrapFetchWithPayment } from '@x402/fetch';

// Monad Testnet
const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'Monad', symbol: 'MON' },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
} as const;

const API_URL = 'https://qkcytrdhdtemyphsswou.supabase.co/functions/v1/x402-create-market';

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

  // Create EVM signer for x402
  const evmSigner = {
    address: account.address,
    signTypedData: async (message: Parameters<typeof walletClient.signTypedData>[0]) => {
      return walletClient.signTypedData(message);
    },
  };

  // Initialize x402 client with ExactEvmScheme
  const exactScheme = new ExactEvmScheme(evmSigner);
  const client = new x402Client();
  client.register('eip155:10143', exactScheme);

  // Wrap fetch with automatic payment handling
  const paymentFetch = wrapFetchWithPayment(fetch, client);

  // Market data to create
  const marketData = {
    address: '0x5dE4C48946C008D762A979ae3c94BA86e96eC504',
    question: 'Will ETH flip BTC market cap by 2027?',
    resolutionTime: 1798761600,
    oracle: '0x87C965003e62b7E6a5E3462391E827544Cf0985a',
    yesTokenAddress: '0xA5924d84BFab7d63d66B25d5d21F49fc78b4DaA4',
    noTokenAddress: '0x96d8522C769734bf4b4e646fBbAC15FEB8f8Ef60',
    initialLiquidity: '1',
    alpha: '0.03',
    category: 'crypto',
    tags: ['ethereum', 'bitcoin', 'flippening'],
  };

  console.log('\nMarket data:', marketData);
  console.log('\nCalling x402-create-market with automatic payment...');

  try {
    // First, make the request without payment to get the 402 challenge
    const initialResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(marketData),
    });

    console.log('Initial response status:', initialResponse.status);

    if (initialResponse.status === 402) {
      const challenge = await initialResponse.json();
      console.log('402 Challenge:', challenge);

      // Now use paymentFetch which handles the x402 flow automatically
      const response = await paymentFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(marketData),
      });

      const result = await response.json();
      console.log('\nResponse status:', response.status);
      console.log('Response:', JSON.stringify(result, null, 2));

      if (response.status === 201) {
        console.log('\n✅ Market created successfully via x402!');
        if (result.payment?.txHash) {
          console.log('Payment tx:', result.payment.txHash);
        }
      } else {
        console.log('\n❌ Failed to create market');
      }
    } else if (initialResponse.status === 409) {
      console.log('Market already exists in database');
    } else {
      const result = await initialResponse.json();
      console.log('Unexpected response:', result);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main().catch(console.error);
