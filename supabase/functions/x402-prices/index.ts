// Edge Function: x402-prices
// Get market prices - x402 protected (0.0001 USDC)
// Also syncs prices to database for frontend accuracy

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createPublicClient, http, formatUnits } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const LSLMSR_ABI = [
  { name: "getYesPrice", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getNoPrice", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getYesProbability", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getNoProbability", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "yesShares", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "noShares", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "totalCollateral", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "collateralDecimals", type: "function", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { name: "resolved", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { name: "yesWins", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
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

    // Query blockchain
    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    // Fetch all market data from blockchain
    const [yesPrice, noPrice, yesProbability, noProbability, yesShares, noShares, totalCollateral, decimals, resolved, yesWins] = await Promise.all([
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "getYesPrice" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "getNoPrice" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "getYesProbability" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "getNoProbability" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "yesShares" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "noShares" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "totalCollateral" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "collateralDecimals" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "resolved" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "yesWins" }),
    ]);

    const yes = Number(yesPrice) / 1e18;
    const no = Number(noPrice) / 1e18;

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
          yes_shares: formatUnits(yesShares as bigint, 18),
          no_shares: formatUnits(noShares as bigint, 18),
          total_collateral: formatUnits(totalCollateral as bigint, Number(decimals)),
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
          yes: formatUnits(yesShares as bigint, 18),
          no: formatUnits(noShares as bigint, 18),
        },
        totalCollateral: formatUnits(totalCollateral as bigint, Number(decimals)),
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
