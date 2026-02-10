// Edge Function: x402-market-data
// Premium market data endpoint protected by x402 micropayments (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const marketAddress = url.searchParams.get("market");

    if (!marketAddress) {
      return new Response(
        JSON.stringify({ error: "market parameter is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle x402 payment (verify, settle, and log)
    const paymentResult = await handlePayment(req, "x402-market-data", { market: marketAddress });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch premium market data
    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select(`
        *,
        trades:trades(count),
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

    if (marketError || !market) {
      return new Response(
        JSON.stringify({ error: "Market not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate premium analytics
    const yesPrice = parseFloat(market.yes_price || "0.5");
    const noPrice = parseFloat(market.no_price || "0.5");
    const totalVolume = parseFloat(market.total_volume || "0");
    const totalTrades = market.total_trades || 0;

    const premiumData = {
      market: {
        address: market.address,
        question: market.question,
        status: market.status,
        resolved: market.resolved,
        yesWins: market.yes_wins,
        resolutionTime: market.resolution_time,
      },
      pricing: {
        yesPrice,
        noPrice,
        impliedProbability: {
          yes: yesPrice / (yesPrice + noPrice),
          no: noPrice / (yesPrice + noPrice),
        },
        spread: Math.abs(yesPrice - noPrice),
      },
      liquidity: {
        yesShares: market.yes_shares,
        noShares: market.no_shares,
        totalCollateral: market.total_collateral,
        liquidityParameter: market.liquidity_parameter,
      },
      activity: {
        totalVolume,
        totalTrades,
        uniqueTraders: market.unique_traders || 0,
        avgTradeSize: totalTrades > 0 ? totalVolume / totalTrades : 0,
        recentTrades: market.recent_trades || [],
      },
      fees: {
        totalProtocolFees: market.total_protocol_fees || "0",
        totalCreatorFees: market.total_creator_fees || "0",
      },
      metadata: {
        category: market.category,
        tags: market.tags,
        createdAt: market.created_at,
        updatedAt: market.updated_at,
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
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
