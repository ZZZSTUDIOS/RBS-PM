// Edge Function: x402-agent-trade
// Get trade instructions for AI agents - x402 protected (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { encodeFunctionData, parseUnits } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

// USDC address on Monad Testnet
const USDC_ADDRESS = "0x534b2f3A21130d7a60830c2Df862319e593943A3";

// LSLMSR ABI for encoding trade calls
const LSLMSR_ABI = [
  {
    name: "buy",
    type: "function",
    inputs: [
      { name: "isYes", type: "bool" },
      { name: "collateralAmount", type: "uint256" },
      { name: "minShares", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "sell",
    type: "function",
    inputs: [
      { name: "isYes", type: "bool" },
      { name: "shares", type: "uint256" },
      { name: "minPayout", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ERC20 ABI for approval
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

interface TradeRequest {
  marketAddress: string;
  traderAddress: string;
  direction: "buy" | "sell";
  outcome: "yes" | "no";
  amount: string;
  minOutput?: string;
  agentId?: string;
}

interface TradeInstructions {
  approval?: { to: string; data: string; description: string };
  trade: { to: string; data: string; description: string };
  summary: { direction: string; outcome: string; amount: string; marketAddress: string };
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
    // Parse request body first to get request params for logging
    const body = await req.json() as TradeRequest;

    // Handle x402 payment (verify, settle, and log)
    const paymentResult = await handlePayment(req, "x402-agent-trade", {
      marketAddress: body.marketAddress,
      direction: body.direction,
      outcome: body.outcome,
      amount: body.amount,
    });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Validate required fields
    if (!body.marketAddress || !body.traderAddress || !body.direction || !body.outcome || !body.amount) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          required: ["marketAddress", "traderAddress", "direction", "outcome", "amount"],
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate address formats
    if (!/^0x[a-fA-F0-9]{40}$/.test(body.marketAddress)) {
      return new Response(
        JSON.stringify({ error: "Invalid market address format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(body.traderAddress)) {
      return new Response(
        JSON.stringify({ error: "Invalid trader address format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isYes = body.outcome.toLowerCase() === "yes";
    const isBuy = body.direction.toLowerCase() === "buy";

    // Parse amount (USDC has 6 decimals, shares have 18)
    const decimals = isBuy ? 6 : 18;
    const amountBigInt = parseUnits(body.amount, decimals);
    const minOutput = body.minOutput ? BigInt(body.minOutput) : 0n;

    let instructions: TradeInstructions;

    if (isBuy) {
      const approvalData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [body.marketAddress as `0x${string}`, amountBigInt],
      });

      const buyData = encodeFunctionData({
        abi: LSLMSR_ABI,
        functionName: "buy",
        args: [isYes, amountBigInt, minOutput],
      });

      instructions = {
        approval: {
          to: USDC_ADDRESS,
          data: approvalData,
          description: `Approve ${body.amount} USDC for market contract`,
        },
        trade: {
          to: body.marketAddress,
          data: buyData,
          description: `Buy ${isYes ? "YES" : "NO"} shares with ${body.amount} USDC`,
        },
        summary: {
          direction: "buy",
          outcome: isYes ? "YES" : "NO",
          amount: `${body.amount} USDC`,
          marketAddress: body.marketAddress,
        },
      };
    } else {
      const sellData = encodeFunctionData({
        abi: LSLMSR_ABI,
        functionName: "sell",
        args: [isYes, amountBigInt, minOutput],
      });

      instructions = {
        trade: {
          to: body.marketAddress,
          data: sellData,
          description: `Sell ${body.amount} ${isYes ? "YES" : "NO"} shares`,
        },
        summary: {
          direction: "sell",
          outcome: isYes ? "YES" : "NO",
          amount: `${body.amount} shares`,
          marketAddress: body.marketAddress,
        },
      };
    }

    // Log trade intent
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase.from("agent_trade_intents").insert({
        market_address: body.marketAddress.toLowerCase(),
        trader_address: body.traderAddress.toLowerCase(),
        agent_id: body.agentId || null,
        direction: body.direction,
        outcome: body.outcome,
        amount: body.amount,
        created_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.log("Trade logging skipped:", logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        instructions,
        note: "Execute transactions in order: approval first (if present), then trade",
        payment: {
          amount: X402_CONFIG.price,
          amountFormatted: X402_CONFIG.priceFormatted,
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
