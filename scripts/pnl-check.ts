/**
 * Calculate P&L from all trades
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/pnl-check.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qkcytrdhdtemyphsswou.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mKTNqXht6ek37VkHAGWoUQ_TMzoC3wp';
const WALLET = '0x87C965003e62b7E6a5E3462391E827544Cf0985a';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Get user ID
  const { data: user } = await supabase
    .from('users')
    .select('id, total_volume, total_pnl')
    .ilike('wallet_address', WALLET)
    .single();

  if (!user) { console.error('User not found'); return; }

  // Get all trades
  const { data: trades } = await supabase
    .from('trades')
    .select('trade_type, outcome, amount, created_at, markets:market_id (question)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  let totalBought = 0;
  let totalSold = 0;
  let totalRedeemed = 0;

  for (const t of trades || []) {
    const amount = Number(t.amount);
    if (t.trade_type === 'BUY') totalBought += amount;
    else if (t.trade_type === 'SELL') totalSold += amount;
    else if (t.trade_type === 'REDEEM') totalRedeemed += amount;
  }

  const totalReturns = totalSold + totalRedeemed;
  const pnl = totalReturns - totalBought;

  console.log('=== P&L Summary ===');
  console.log(`Total trades: ${trades?.length}`);
  console.log(`Total spent (BUY):      ${totalBought.toFixed(4)} USDC`);
  console.log(`Total received (SELL):   ${totalSold.toFixed(4)} USDC`);
  console.log(`Total received (REDEEM): ${totalRedeemed.toFixed(4)} USDC`);
  console.log(`---`);
  console.log(`Net P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} USDC`);
  console.log(`\nDB recorded P&L: ${user.total_pnl}`);
}

main().catch(console.error);
