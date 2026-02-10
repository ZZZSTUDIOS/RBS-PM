// Edge Function: x402-market-data
// Premium market data endpoint protected by x402 micropayments

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-payment",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// x402 Configuration
const X402_CONFIG = {
  network: "eip155:10143",
  facilitator: "https://x402-facilitator.molandak.org",
  prices: {
    marketData: "10000", // 0.01 USDC
  },
  // Protocol fee recipient (receives x402 payments)
  recipient: "0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE",
};

interface PaymentPayload {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

// Parse x402 payment header
function parsePaymentHeader(header: string): { version: string; network: string; payload: PaymentPayload; signature: string } | null {
  if (!header.startsWith("x402 ")) {
    return null;
  }

  const parts = header.slice(5).split(":");
  if (parts.length !== 4) {
    return null;
  }

  const [version, network, payloadB64, signature] = parts;

  try {
    const payload = JSON.parse(atob(payloadB64)) as PaymentPayload;
    return { version, network, payload, signature };
  } catch {
    return null;
  }
}

// Verify payment with x402 facilitator
async function verifyPayment(payment: ReturnType<typeof parsePaymentHeader>): Promise<{ valid: boolean; error?: string }> {
  if (!payment) {
    return { valid: false, error: "Invalid payment header format" };
  }

  // Check network
  if (payment.network !== X402_CONFIG.network) {
    return { valid: false, error: `Invalid network: ${payment.network}` };
  }

  // Check amount
  if (BigInt(payment.payload.value) < BigInt(X402_CONFIG.prices.marketData)) {
    return { valid: false, error: "Insufficient payment amount" };
  }

  // Check recipient
  if (payment.payload.to.toLowerCase() !== X402_CONFIG.recipient.toLowerCase()) {
    return { valid: false, error: "Invalid payment recipient" };
  }

  // Check validity window
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(payment.payload.validAfter) > BigInt(now)) {
    return { valid: false, error: "Payment not yet valid" };
  }
  if (BigInt(payment.payload.validBefore) < BigInt(now)) {
    return { valid: false, error: "Payment expired" };
  }

  // In production, verify signature with facilitator
  try {
    const facilitatorResponse = await fetch(`${X402_CONFIG.facilitator}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        network: payment.network,
        payload: payment.payload,
        signature: payment.signature,
      }),
    });

    if (facilitatorResponse.ok) {
      const result = await facilitatorResponse.json();
      return { valid: result.valid };
    }

    // If facilitator is unavailable, do basic validation
    console.warn("Facilitator unavailable, using basic validation");
    return { valid: true };
  } catch (err) {
    console.warn("Facilitator error:", err);
    // Fallback to basic validation
    return { valid: true };
  }
}

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

    // Check for payment header
    const paymentHeader = req.headers.get("X-Payment");

    if (!paymentHeader) {
      // Return 402 with payment requirement
      const challenge = btoa(JSON.stringify({
        amount: X402_CONFIG.prices.marketData,
        recipient: X402_CONFIG.recipient,
        network: X402_CONFIG.network,
        asset: "USDC",
        description: "Premium market data access",
      }));

      return new Response(
        JSON.stringify({
          error: "Payment required",
          amount: X402_CONFIG.prices.marketData,
          asset: "USDC",
          network: X402_CONFIG.network,
        }),
        {
          status: 402,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "WWW-Authenticate": `x402 ${challenge}`,
          },
        }
      );
    }

    // Parse and verify payment
    const payment = parsePaymentHeader(paymentHeader);
    const verification = await verifyPayment(payment);

    if (!verification.valid) {
      return new Response(
        JSON.stringify({ error: "Invalid payment", details: verification.error }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Record the payment
    if (payment) {
      // Try to find agent by address
      const { data: agentData } = await supabase
        .from("agents")
        .select("id")
        .ilike("controller_address", payment.payload.from)
        .single();

      await supabase.rpc("record_x402_payment", {
        p_agent_id: agentData?.id || null,
        p_endpoint: "x402-market-data",
        p_amount: payment.payload.value,
        p_payment_header: paymentHeader,
      });
    }

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
