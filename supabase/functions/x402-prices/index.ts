// Edge Function: x402-prices
// Get market prices - x402 protected (0.0001 USDC)
// Also syncs prices to database for frontend accuracy

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createPublicClient, http, formatUnits } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

// Single call returns all market data — avoids 10 separate RPC calls
const LSLMSR_ABI = [
  {
    name: "getMarketInfo",
    type: "function",
    inputs: [],
    outputs: [
      { name: "_question", type: "string" },
      { name: "_resolutionTime", type: "uint256" },
      { name: "_oracle", type: "address" },
      { name: "_yesPrice", type: "uint256" },
      { name: "_noPrice", type: "uint256" },
      { name: "_yesProbability", type: "uint256" },
      { name: "_noProbability", type: "uint256" },
      { name: "_yesShares", type: "uint256" },
      { name: "_noShares", type: "uint256" },
      { name: "_totalCollateral", type: "uint256" },
      { name: "_liquidityParam", type: "uint256" },
      { name: "_priceSum", type: "uint256" },
      { name: "_resolved", type: "bool" },
      { name: "_yesWins", type: "bool" },
    ],
    stateMutability: "view",
  },
] as const;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const market = url.searchParams.get("market");

    if (!market || !/^0x[a-fA-F0-9]{40}$/.test(market)) {
      return new Response(
        JSON.stringify({ error: "Valid market address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle x402 payment (verify, settle, and log)
    const paymentResult = await handlePayment(req, "x402-prices", { market });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Query blockchain — single call instead of 10 parallel calls
    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const result = await client.readContract({
      address: market as `0x${string}`,
      abi: LSLMSR_ABI,
      functionName: "getMarketInfo",
    }) as readonly [string, bigint, string, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean];

    const [, , , yesPrice, noPrice, yesProbability, noProbability, yesShares, noShares, totalCollateral, , , resolved, yesWins] = result;

    const yes = Number(yesPrice) / 1e18;
    const no = Number(noPrice) / 1e18;
    const decimals = 6; // USDC

    // Sync prices to database (fire and forget - don't block response)
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase
        .from("markets")
        .update({
          yes_price: yes,
          no_price: no,
          yes_shares: formatUnits(yesShares, 18),
          no_shares: formatUnits(noShares, 18),
          total_collateral: formatUnits(totalCollateral, decimals),
          resolved: resolved,
          yes_wins: yesWins,
          updated_at: new Date().toISOString(),
        })
        .ilike("address", market);
    } catch (dbErr) {
      console.log("Database sync skipped:", dbErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        market,
        prices: {
          yes,
          no,
          yesFormatted: `${(yes * 100).toFixed(1)}%`,
          noFormatted: `${(no * 100).toFixed(1)}%`,
        },
        probability: {
          yes: Number(yesProbability) / 1e18,
          no: Number(noProbability) / 1e18,
        },
        shares: {
          yes: formatUnits(yesShares, 18),
          no: formatUnits(noShares, 18),
        },
        totalCollateral: formatUnits(totalCollateral, decimals),
        resolved,
        yesWins,
        synced: true,
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
