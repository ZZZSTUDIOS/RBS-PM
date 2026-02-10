// Edge Function: sync-market-prices
// Fetches current prices from blockchain and updates the markets table
// Called after trades to keep database in sync

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createPublicClient, http, formatUnits } from "https://esm.sh/viem@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

const monadTestnet = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { marketAddress } = body;

    if (!marketAddress || !/^0x[a-fA-F0-9]{40}$/.test(marketAddress)) {
      return new Response(
        JSON.stringify({ error: "Valid marketAddress required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = createPublicClient({
      chain: monadTestnet as any,
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    // Fetch market info from blockchain
    const marketInfo = await client.readContract({
      address: marketAddress as `0x${string}`,
      abi: LSLMSR_ABI,
      functionName: "getMarketInfo",
    });

    const [
      question,
      resolutionTime,
      oracle,
      yesPrice,
      noPrice,
      yesProbability,
      noProbability,
      yesShares,
      noShares,
      totalCollateral,
      liquidityParam,
      priceSum,
      resolved,
      yesWins,
    ] = marketInfo;

    // Convert prices from 1e18 to decimal (0-1)
    const yesPriceDecimal = Number(yesPrice) / 1e18;
    const noPriceDecimal = Number(noPrice) / 1e18;
    const yesProbDecimal = Number(yesProbability) / 1e18;
    const noProbDecimal = Number(noProbability) / 1e18;

    // Format shares and collateral
    const yesSharesFormatted = formatUnits(yesShares, 18);
    const noSharesFormatted = formatUnits(noShares, 18);
    const totalCollateralFormatted = formatUnits(totalCollateral, 6); // USDC has 6 decimals

    // Upsert to database (insert if not exists, update if exists)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("markets")
      .upsert({
        address: marketAddress.toLowerCase(),
        question: question,
        resolution_time: new Date(Number(resolutionTime) * 1000).toISOString(),
        oracle_address: oracle.toLowerCase(),
        creator_address: oracle.toLowerCase(), // Default to oracle
        yes_token_address: "0x0000000000000000000000000000000000000000", // Placeholder
        no_token_address: "0x0000000000000000000000000000000000000000", // Placeholder
        yes_price: yesPriceDecimal,
        no_price: noPriceDecimal,
        yes_shares: yesSharesFormatted,
        no_shares: noSharesFormatted,
        total_collateral: totalCollateralFormatted,
        resolved: resolved,
        yes_wins: yesWins,
        status: resolved ? "RESOLVED" : "ACTIVE",
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "address",
      })
      .select()
      .single();

    if (error) {
      console.error("Database upsert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to upsert market", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        market: marketAddress,
        prices: {
          yes: yesPriceDecimal,
          no: noPriceDecimal,
          yesFormatted: `${(yesPriceDecimal * 100).toFixed(2)}%`,
          noFormatted: `${(noPriceDecimal * 100).toFixed(2)}%`,
        },
        probability: {
          yes: yesProbDecimal,
          no: noProbDecimal,
        },
        shares: {
          yes: yesSharesFormatted,
          no: noSharesFormatted,
        },
        totalCollateral: totalCollateralFormatted,
        resolved,
        yesWins,
        updatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
