import { createPublicClient, http } from 'viem';

const LSLMSR_ABI = [
  {
    name: 'getMarketInfo',
    type: 'function',
    inputs: [],
    outputs: [
      { name: 'question', type: 'string' },
      { name: 'resolutionTime', type: 'uint256' },
      { name: 'oracle', type: 'address' },
      { name: 'yesPrice', type: 'uint256' },
      { name: 'noPrice', type: 'uint256' },
      { name: 'yesProbability', type: 'uint256' },
      { name: 'noProbability', type: 'uint256' },
      { name: 'yesShares', type: 'uint256' },
      { name: 'noShares', type: 'uint256' },
      { name: 'totalCollateral', type: 'uint256' },
      { name: 'liquidityParameter', type: 'uint256' },
      { name: 'priceSum', type: 'uint256' },
      { name: 'resolved', type: 'bool' },
      { name: 'yesWins', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'yesToken',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'noToken',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
] as const;

async function main() {
  const client = createPublicClient({
    transport: http('https://testnet-rpc.monad.xyz'),
  });

  const marketAddress = '0x605c6515bf87dfaabc1b982bb08d8018e18a49fc' as const;

  const [marketInfo, yesToken, noToken] = await Promise.all([
    client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: 'getMarketInfo' }),
    client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: 'yesToken' }),
    client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: 'noToken' }),
  ]);

  console.log(JSON.stringify({
    question: marketInfo[0],
    resolutionTime: marketInfo[1].toString(),
    oracle: marketInfo[2],
    yesPrice: (Number(marketInfo[3]) / 1e18).toFixed(6),
    noPrice: (Number(marketInfo[4]) / 1e18).toFixed(6),
    yesToken,
    noToken,
    resolved: marketInfo[12],
  }, null, 2));
}

main();
