// Edge Function: x402-market-data
// Premium market data endpoint protected by x402 micropayments (0.0001 USDC)
// Reads LIVE prices from blockchain, metadata from Supabase

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createPublicClient, http, formatUnits } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

// LSLMSR ABI for reading market state
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
  {
    name: "getFeeInfo",
    type: "function",
    inputs: [],
    outputs: [{ name: "pendingCreatorFees", type: "uint256" }],
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const marketAddress = url.searchParams.get("market");

    if (!marketAddress || !/^0x[a-fA-F0-9]{40}$/.test(marketAddress)) {
      return new Response(
        JSON.stringify({ error: "Valid market address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle x402 payment (verify, settle, and log)
    const paymentResult = await handlePayment(req, "x402-market-data", { market: marketAddress });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Create blockchain client for LIVE price data
    const publicClient = createPublicClient({
      chain: monadTestnet as any,
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    // Fetch LIVE market data from blockchain
    const [marketInfo, pendingCreatorFees] = await Promise.all([
      publicClient.readContract({
        address: marketAddress as `0x${string}`,
        abi: LSLMSR_ABI,
        functionName: "getMarketInfo",
      }),
      publicClient.readContract({
        address: marketAddress as `0x${string}`,
        abi: LSLMSR_ABI,
        functionName: "getFeeInfo",
      }).catch(() => 0n), // Fallback if getFeeInfo fails
    ]);

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
      _priceSum,
      resolved,
      yesWins,
    ] = marketInfo;

    // Convert prices from 1e18 to decimal (0-1)
    const yesPriceDecimal = Number(yesPrice) / 1e18;
    const noPriceDecimal = Number(noPrice) / 1e18;

    // Initialize Supabase for metadata/trade history
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch trade history, metadata, and analytics from Supabase (non-blocking)
    const { data: market } = await supabase
      .from("markets")
      .select(`
        category,
        tags,
        total_volume,
        total_trades,
        unique_traders,
        created_at,
        velocity_1m,
        velocity_5m,
        velocity_15m,
        acceleration,
        stress_score,
        fragility,
        fee_velocity_24h,
        heat_score,
        volume_24h,
        trades_24h,
        recent_trades:trades(
          id,
          trade_type,
          outcome,
          shares,
          amount,
          created_at
        )
      `)
      .ilike("address", marketAddress)
      .order("created_at", { referencedTable: "recent_trades", ascending: false })
      .limit(10, { referencedTable: "recent_trades" })
      .single();

    const totalVolume = parseFloat(market?.total_volume || "0");
    const totalTrades = market?.total_trades || 0;

    const premiumData = {
      market: {
        address: marketAddress.toLowerCase(),
        question: question,
        status: resolved ? "RESOLVED" : "ACTIVE",
        resolved: resolved,
        yesWins: yesWins,
        resolutionTime: new Date(Number(resolutionTime) * 1000).toISOString(),
        oracle: oracle,
      },
      pricing: {
        yesPrice: yesPriceDecimal,
        noPrice: noPriceDecimal,
        impliedProbability: {
          yes: Number(yesProbability) / 1e18,
          no: Number(noProbability) / 1e18,
        },
        spread: Math.abs(yesPriceDecimal - noPriceDecimal),
        source: "blockchain", // Indicate this is LIVE data
      },
      liquidity: {
        yesShares: formatUnits(yesShares, 18),
        noShares: formatUnits(noShares, 18),
        totalCollateral: formatUnits(totalCollateral, 6), // USDC has 6 decimals
        liquidityParameter: formatUnits(liquidityParam, 18),
      },
      activity: {
        totalVolume,
        totalTrades,
        uniqueTraders: market?.unique_traders || 0,
        avgTradeSize: totalTrades > 0 ? totalVolume / totalTrades : 0,
        recentTrades: market?.recent_trades || [],
      },
      fees: {
        // Note: 0.5% trading fee goes 100% to market creator (no protocol fee)
        pendingCreatorFees: formatUnits(pendingCreatorFees as bigint, 6),
      },
      analytics: {
        velocity: {
          v1m: parseFloat(market?.velocity_1m || "0"),
          v5m: parseFloat(market?.velocity_5m || "0"),
          v15m: parseFloat(market?.velocity_15m || "0"),
          acceleration: parseFloat(market?.acceleration || "0"),
        },
        stressScore: parseFloat(market?.stress_score || "0"),
        fragility: parseFloat(market?.fragility || "0"),
        feeVelocity24h: parseFloat(market?.fee_velocity_24h || "0"),
        heatScore: parseFloat(market?.heat_score || "0"),
        volume24h: parseFloat(market?.volume_24h || "0"),
        trades24h: parseInt(market?.trades_24h || "0"),
      },
      metadata: {
        category: market?.category || null,
        tags: market?.tags || null,
        createdAt: market?.created_at || null,
      },
      payment: {
        amount: X402_CONFIG.price,
        amountFormatted: X402_CONFIG.priceFormatted,
        payer: paymentResult.payerAddress,
      },
    };

    return new Response(
      JSON.stringify(premiumData),
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
