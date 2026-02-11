// Edge Function: x402-confirm-trade
// Records an on-chain trade in the database by parsing tx receipt logs
// Called by SDK/agents after executing a trade to sync with frontend

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handlePayment } from "../_shared/x402.ts";

// Monad Testnet RPC
const RPC_URL = "https://testnet-rpc.monad.xyz";

// Event signatures (keccak256 hashes)
const EVENT_SIGS = {
  SharesPurchased: "0x9bd054fb950acb82b978a4ba93668286e2c3fa8c43589f21061c8520068ba80c",
  SharesSold: "0xcf06b88583ec57d4cf2f6795931fe9057d95a86052efc8d8b3a4cad0e885d5e9",
  Redeemed: "0xf3a670cd3af7d64b488926880889d08a8585a138ff455227af6737339a1ec262",
} as const;

// Fee rate: 0.5% trading fee, split equally between trading_fee and creator_fee
const FEE_RATE = 0.005;

interface ConfirmTradeRequest {
  txHash: string;
  marketAddress: string;
}

interface ParsedTrade {
  tradeType: "BUY" | "SELL" | "REDEEM";
  trader: string;
  outcome: "YES" | "NO";
  shares: string; // decimal string (18 decimals)
  amount: string; // decimal string (6 decimals for USDC)
}

// Fetch transaction receipt from RPC
async function getTransactionReceipt(txHash: string): Promise<{
  logs: Array<{ address: string; topics: string[]; data: string }>;
  blockNumber: string;
  status: string;
} | null> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash],
    }),
  });

  const result = await response.json();
  return result.result || null;
}

// Fetch block timestamp
async function getBlockTimestamp(blockNumberHex: string): Promise<string | null> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBlockByNumber",
      params: [blockNumberHex, false],
    }),
  });

  const result = await response.json();
  if (!result.result?.timestamp) return null;
  const ts = parseInt(result.result.timestamp, 16);
  return new Date(ts * 1000).toISOString();
}

// Parse hex to decimal string with proper decimals
function hexToDecimalString(hex: string, decimals: number): string {
  const value = BigInt(hex);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0");
  return `${whole}.${fractionStr}`;
}

// Parse event logs to extract trade data
function parseTradeLogs(
  logs: Array<{ address: string; topics: string[]; data: string }>,
  marketAddress: string
): ParsedTrade | null {
  const marketAddr = marketAddress.toLowerCase();

  for (const log of logs) {
    if (log.address.toLowerCase() !== marketAddr) continue;
    const topic0 = log.topics[0];

    if (topic0 === EVENT_SIGS.SharesPurchased) {
      // SharesPurchased(address indexed buyer, bool isYes, uint256 shares, uint256 cost)
      const trader = "0x" + log.topics[1].slice(26);
      const data = log.data.slice(2); // remove 0x
      const isYes = BigInt("0x" + data.slice(0, 64)) !== 0n;
      const sharesHex = "0x" + data.slice(64, 128);
      const costHex = "0x" + data.slice(128, 192);

      return {
        tradeType: "BUY",
        trader,
        outcome: isYes ? "YES" : "NO",
        shares: hexToDecimalString(sharesHex, 18),
        amount: hexToDecimalString(costHex, 6), // USDC has 6 decimals
      };
    }

    if (topic0 === EVENT_SIGS.SharesSold) {
      // SharesSold(address indexed seller, bool isYes, uint256 shares, uint256 payout)
      const trader = "0x" + log.topics[1].slice(26);
      const data = log.data.slice(2);
      const isYes = BigInt("0x" + data.slice(0, 64)) !== 0n;
      const sharesHex = "0x" + data.slice(64, 128);
      const payoutHex = "0x" + data.slice(128, 192);

      return {
        tradeType: "SELL",
        trader,
        outcome: isYes ? "YES" : "NO",
        shares: hexToDecimalString(sharesHex, 18),
        amount: hexToDecimalString(payoutHex, 6),
      };
    }

    if (topic0 === EVENT_SIGS.Redeemed) {
      // Redeemed(address indexed user, uint256 shares, uint256 payout)
      const trader = "0x" + log.topics[1].slice(26);
      const data = log.data.slice(2);
      const sharesHex = "0x" + data.slice(0, 64);
      const payoutHex = "0x" + data.slice(64, 128);

      return {
        tradeType: "REDEEM",
        trader,
        outcome: "YES", // Redeem doesn't specify outcome, default YES
        shares: hexToDecimalString(sharesHex, 18),
        amount: hexToDecimalString(payoutHex, 6),
      };
    }
  }

  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json() as ConfirmTradeRequest;

    // Handle x402 payment
    const paymentResult = await handlePayment(req, "x402-confirm-trade", {
      txHash: body.txHash,
      marketAddress: body.marketAddress,
    });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Validate required fields
    if (!body.txHash || !body.marketAddress) {
      return new Response(
        JSON.stringify({ error: "Missing required fields", required: ["txHash", "marketAddress"] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate formats
    if (!/^0x[a-fA-F0-9]{64}$/.test(body.txHash)) {
      return new Response(
        JSON.stringify({ error: "Invalid txHash format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(body.marketAddress)) {
      return new Response(
        JSON.stringify({ error: "Invalid marketAddress format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch transaction receipt
    const receipt = await getTransactionReceipt(body.txHash);
    if (!receipt) {
      return new Response(
        JSON.stringify({ error: "Transaction not found. It may not be confirmed yet." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (receipt.status !== "0x1") {
      return new Response(
        JSON.stringify({ error: "Transaction reverted" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse trade events from logs
    const trade = parseTradeLogs(receipt.logs, body.marketAddress);
    if (!trade) {
      return new Response(
        JSON.stringify({ error: "No trade events found in transaction logs for this market" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get block info
    const blockNumber = parseInt(receipt.blockNumber, 16);
    const blockTimestamp = await getBlockTimestamp(receipt.blockNumber);

    // Connect to Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up market_id from markets table
    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id")
      .ilike("address", body.marketAddress)
      .single();

    if (marketError || !market) {
      return new Response(
        JSON.stringify({ error: `Market not found in database: ${body.marketAddress}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create user
    const { data: userData, error: userError } = await supabase
      .rpc("get_or_create_user", { p_wallet_address: trade.trader.toLowerCase() });

    if (userError || !userData || userData.length === 0) {
      return new Response(
        JSON.stringify({ error: `Failed to get/create user: ${userError?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData[0].id;

    // Calculate fees (0.5% for buys, applied to cost)
    const amount = parseFloat(trade.amount);
    let tradingFee = 0;
    let creatorFee = 0;
    if (trade.tradeType === "BUY") {
      tradingFee = amount * FEE_RATE;
      creatorFee = tradingFee;
    }

    // Calculate price at trade (for buys: cost / shares, for sells: payout / shares)
    const shares = parseFloat(trade.shares);
    const priceAtTrade = shares > 0 ? amount / shares : null;

    // Upsert into trades table (idempotent on tx_hash + outcome)
    const { data: tradeRow, error: tradeError } = await supabase
      .from("trades")
      .upsert(
        {
          market_id: market.id,
          user_id: userId,
          trade_type: trade.tradeType,
          outcome: trade.outcome,
          shares: trade.shares,
          amount: trade.amount,
          price_at_trade: priceAtTrade,
          trading_fee: tradingFee,
          protocol_fee: 0,
          creator_fee: creatorFee,
          tx_hash: body.txHash.toLowerCase(),
          block_number: blockNumber,
          block_timestamp: blockTimestamp,
        },
        { onConflict: "tx_hash,outcome" }
      )
      .select()
      .single();

    if (tradeError) {
      console.error("Trade upsert error:", tradeError);
      return new Response(
        JSON.stringify({ error: `Failed to record trade: ${tradeError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update matching agent_trade_intents row if exists
    try {
      await supabase
        .from("agent_trade_intents")
        .update({
          tx_hash: body.txHash.toLowerCase(),
          confirmed: true,
          confirmed_at: new Date().toISOString(),
        })
        .eq("market_address", body.marketAddress.toLowerCase())
        .eq("trader_address", trade.trader.toLowerCase())
        .is("tx_hash", null);
    } catch (intentErr) {
      console.log("Agent intent update skipped:", intentErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        trade: {
          id: tradeRow.id,
          tradeType: trade.tradeType,
          outcome: trade.outcome,
          shares: trade.shares,
          amount: trade.amount,
          trader: trade.trader,
          txHash: body.txHash,
          blockNumber,
          tradingFee,
          creatorFee,
        },
        payment: {
          payer: paymentResult.payerAddress,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
