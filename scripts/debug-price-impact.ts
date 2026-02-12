import { createPublicClient, http, parseUnits, formatEther } from 'viem';

const SCALE = BigInt(1e18);
const RPC = 'https://testnet-rpc.monad.xyz';
const MARKET = '0xd68a2957c1697131301eaeed6763395fffad4904';

const client = createPublicClient({ transport: http(RPC) });

const ABI = [
  { name: 'yesShares', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'noShares', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'alpha', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'minLiquidity', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'getMarketInfo', type: 'function', inputs: [], outputs: [
    { type: 'string' }, { type: 'uint256' }, { type: 'address' },
    { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
    { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
    { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'bool' },
  ], stateMutability: 'view' },
  { name: 'estimateSharesForPayment', type: 'function', inputs: [{ name: 'isYes', type: 'bool' }, { name: 'payment', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

function expApprox(x: bigint): bigint {
  const cap = 6n * SCALE;
  if (x > cap) x = cap;
  let result = SCALE;
  let term = SCALE;
  for (let i = 1n; i <= 12n; i++) {
    term = (term * x) / (i * SCALE);
    result += term;
    if (term < 1n) break;
  }
  return result;
}

function lnApprox(x: bigint): bigint {
  if (x < SCALE) return 0n;
  if (x === SCALE) return 0n;
  const LN2 = 693147180559945309n;
  let halvings = 0n;
  while (x >= 2n * SCALE) {
    x = x / 2n;
    halvings++;
  }
  const y = x - SCALE;
  if (y === 0n) return halvings * LN2;
  let result = 0n;
  let term = y;
  let positive = true;
  for (let i = 1n; i <= 30n; i++) {
    if (positive) result += term / i;
    else result -= term / i;
    term = (term * y) / SCALE;
    positive = !positive;
    if (term < 1n) break;
  }
  return result + halvings * LN2;
}

function costFunction(yesShares: bigint, noShares: bigint, alpha: bigint, minLiquidity: bigint): bigint {
  const totalShares = yesShares + noShares;
  if (totalShares === 0n) return 0n;
  let b = (alpha * totalShares) / SCALE;
  if (b < minLiquidity) b = minLiquidity;
  if (b === 0n) b = SCALE;
  const maxShares = yesShares > noShares ? yesShares : noShares;
  let expYes: bigint, expNo: bigint;
  if (yesShares >= noShares) {
    expYes = SCALE;
    const gap = yesShares - noShares;
    if (gap === 0n) { expNo = SCALE; }
    else {
      const expArg = (gap * SCALE) / b;
      const expGap = expApprox(expArg);
      expNo = (SCALE * SCALE) / expGap;
    }
  } else {
    expNo = SCALE;
    const gap = noShares - yesShares;
    if (gap === 0n) { expYes = SCALE; }
    else {
      const expArg = (gap * SCALE) / b;
      const expGap = expApprox(expArg);
      expYes = (SCALE * SCALE) / expGap;
    }
  }
  const sum = expYes + expNo;
  const lnSum = lnApprox(sum);
  return maxShares + (b * lnSum) / SCALE;
}

function getCost(isYes: boolean, shares: bigint, yesShares: bigint, noShares: bigint, alpha: bigint, minLiquidity: bigint): bigint {
  const newYes = isYes ? yesShares + shares : yesShares;
  const newNo = isYes ? noShares : noShares + shares;
  const newCost = costFunction(newYes, newNo, alpha, minLiquidity);
  const currentCost = costFunction(yesShares, noShares, alpha, minLiquidity);
  return newCost > currentCost ? newCost - currentCost : 0n;
}

async function main() {
  const [yesShares, noShares, alpha, minLiquidity] = await Promise.all([
    client.readContract({ address: MARKET as `0x${string}`, abi: ABI, functionName: 'yesShares' }),
    client.readContract({ address: MARKET as `0x${string}`, abi: ABI, functionName: 'noShares' }),
    client.readContract({ address: MARKET as `0x${string}`, abi: ABI, functionName: 'alpha' }),
    client.readContract({ address: MARKET as `0x${string}`, abi: ABI, functionName: 'minLiquidity' }),
  ]);

  const info = await client.readContract({ address: MARKET as `0x${string}`, abi: ABI, functionName: 'getMarketInfo' });

  console.log('=== On-chain state ===');
  console.log('yesShares:', formatEther(yesShares as bigint));
  console.log('noShares:', formatEther(noShares as bigint));
  console.log('alpha:', formatEther(alpha as bigint));
  console.log('minLiquidity:', formatEther(minLiquidity as bigint));
  console.log('yesPrice:', formatEther(info[3]));
  console.log('noPrice:', formatEther(info[4]));
  console.log('yesProbability:', formatEther(info[5]));
  console.log('noProbability:', formatEther(info[6]));

  const ys = yesShares as bigint;
  const ns = noShares as bigint;
  const a = alpha as bigint;
  const ml = minLiquidity as bigint;

  // Test: cost for tiny amount (should match yesPrice)
  const tinyShares = SCALE / 1000n; // 0.001 shares
  const tinyCost = getCost(true, tinyShares, ys, ns, a, ml);
  console.log('\nMarginal cost for 0.001 YES shares:', formatEther(tinyCost));
  console.log('Expected (0.001 * yesPrice):', (Number(info[3]) * 0.001 / 1e18).toFixed(18));

  // Simulate: 1 USDC BUY YES
  const grossPayment = parseUnits('1', 6);
  const paymentAfterFee = grossPayment - (grossPayment * 50n) / 10000n;
  const shareScale = BigInt(1e12);
  const paymentInShareScale = paymentAfterFee * shareScale;

  console.log('\n=== BUY 1 USDC YES ===');
  console.log('paymentAfterFee (USDC):', Number(paymentAfterFee) / 1e6);
  console.log('paymentInShareScale:', paymentInShareScale.toString());

  // Test a few specific share amounts
  for (const s of [1.0, 2.0, 3.0, 3.1, 3.2, 3.5]) {
    const shares = BigInt(Math.floor(s * 1e18));
    const cost = getCost(true, shares, ys, ns, a, ml);
    console.log(`  cost(${s} shares) = ${formatEther(cost)} (${Number(cost) / 1e18} in share-scale)`);
  }

  // Binary search
  let low = 0n;
  let high = paymentInShareScale * 100n;
  for (let i = 0; i < 64; i++) {
    const mid = (low + high) / 2n;
    const cost = getCost(true, mid, ys, ns, a, ml);
    if (i < 10) {
      console.log(`iter ${i}: mid=${formatEther(mid)} shares, cost=${formatEther(cost)}, payment=${formatEther(paymentInShareScale)}`);
    }
    if (cost <= paymentInShareScale) {
      low = mid;
    } else {
      high = mid;
    }
    if (high - low <= 1n) break;
  }

  console.log('\nJS Result: ~' + formatEther(low) + ' shares');

  const fairValue = Number(info[5]) / 1e18;
  const avgPrice = 1.0 / Number(formatEther(low));
  const impact = ((avgPrice - fairValue) / fairValue) * 100;
  console.log('fairValue (yesProbability):', fairValue);
  console.log('avgPrice:', avgPrice.toFixed(6));
  console.log('price impact:', impact.toFixed(2) + '%');

  // Contract estimate
  try {
    const contractEstimate = await client.readContract({
      address: MARKET as `0x${string}`,
      abi: ABI,
      functionName: 'estimateSharesForPayment',
      args: [true, grossPayment],
    });
    console.log('\nContract estimateSharesForPayment:', formatEther(contractEstimate as bigint));
  } catch (e: any) {
    console.log('\nContract estimate failed:', e.shortMessage?.slice(0, 100) || e.message?.slice(0, 100));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
