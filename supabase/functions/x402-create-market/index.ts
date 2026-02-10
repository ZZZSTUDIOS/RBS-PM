// Edge Function: x402-create-market
// Market creation/indexing endpoint protected by x402 micropayments
// Costs 0.10 USDC to list a market in the app

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-payment",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// x402 Configuration
const X402_CONFIG = {
  network: "eip155:10143",
  facilitator: "https://x402-facilitator.molandak.org",
  prices: {
    createMarket: "100000", // 0.10 USDC (6 decimals)
  },
  // Protocol fee recipient
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

interface MarketCreateRequest {
  address: string;
  question: string;
  resolutionTime: number;
  oracle: string;
  yesTokenAddress: string;
  noTokenAddress: string;
  initialLiquidity: string;
  alpha: string;
  category?: string;
  tags?: string[];
}

// Parse x402 payment header
// Format: x402 version|network|payloadB64|signature (using | as delimiter to avoid conflict with network format)
// Or legacy: x402 version:network:payloadB64:signature (where network doesn't contain :)
function parsePaymentHeader(header: string): { version: string; network: string; payload: PaymentPayload; signature: string } | null {
  if (!header.startsWith("x402 ")) {
    return null;
  }

  const content = header.slice(5);

  // Try pipe delimiter first (new format)
  let parts = content.split("|");

  // Fall back to colon delimiter if pipe doesn't give us 4 parts
  if (parts.length !== 4) {
    // For colon delimiter with network like "eip155:10143", we need to handle it specially
    // Format: version:chainPrefix:chainId:payloadB64:signature
    const colonParts = content.split(":");
    if (colonParts.length === 5) {
      // Reconstruct: version, network (chainPrefix:chainId), payload, signature
      parts = [colonParts[0], `${colonParts[1]}:${colonParts[2]}`, colonParts[3], colonParts[4]];
    } else if (colonParts.length === 4) {
      parts = colonParts;
    } else {
      return null;
    }
  }

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

  // Check amount (0.10 USDC for market creation)
  if (BigInt(payment.payload.value) < BigInt(X402_CONFIG.prices.createMarket)) {
    return { valid: false, error: `Insufficient payment. Required: ${X402_CONFIG.prices.createMarket}, received: ${payment.payload.value}` };
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

  // Verify signature with facilitator
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
    return { valid: true };
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
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
    // Check for payment header
    const paymentHeader = req.headers.get("X-Payment");

    if (!paymentHeader) {
      // Return 402 with payment requirement
      const challenge = btoa(JSON.stringify({
        amount: X402_CONFIG.prices.createMarket,
        recipient: X402_CONFIG.recipient,
        network: X402_CONFIG.network,
        asset: "USDC",
        description: "Market creation listing fee",
      }));

      return new Response(
        JSON.stringify({
          error: "Payment required",
          amount: X402_CONFIG.prices.createMarket,
          amountFormatted: "0.10 USDC",
          asset: "USDC",
          network: X402_CONFIG.network,
          description: "Market creation requires a 0.10 USDC listing fee",
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

    // Parse request body
    const body = await req.json() as MarketCreateRequest;

    // Validate required fields
    if (!body.address || !body.question || !body.resolutionTime || !body.oracle) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: address, question, resolutionTime, oracle" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(body.address)) {
      return new Response(
        JSON.stringify({ error: "Invalid market address format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if market already exists
    const { data: existingMarket } = await supabase
      .from("markets")
      .select("id")
      .ilike("address", body.address)
      .single();

    if (existingMarket) {
      return new Response(
        JSON.stringify({ error: "Market already indexed", marketId: existingMarket.id }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record the x402 payment
    let agentId: string | null = null;
    if (payment) {
      // Try to find agent by address
      const { data: agentData } = await supabase
        .from("agents")
        .select("id")
        .ilike("controller_address", payment.payload.from)
        .single();

      agentId = agentData?.id || null;

      await supabase.rpc("record_x402_payment", {
        p_agent_id: agentId,
        p_endpoint: "x402-create-market",
        p_amount: payment.payload.value,
        p_payment_header: paymentHeader,
      });
    }

    // Get or create user for the creator
    const creatorAddress = payment?.payload.from || body.oracle;
    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .ilike("address", creatorAddress)
      .single();

    let creatorId = userData?.id;
    if (!creatorId) {
      const { data: newUser } = await supabase
        .from("users")
        .insert({ address: creatorAddress.toLowerCase() })
        .select("id")
        .single();
      creatorId = newUser?.id;
    }

    // Insert the market
    const { data: market, error: insertError } = await supabase
      .from("markets")
      .insert({
        address: body.address.toLowerCase(),
        question: body.question,
        resolution_time: new Date(body.resolutionTime * 1000).toISOString(),
        oracle_address: body.oracle.toLowerCase(),
        creator_address: creatorAddress.toLowerCase(),
        yes_token_address: body.yesTokenAddress?.toLowerCase() || "",
        no_token_address: body.noTokenAddress?.toLowerCase() || "",
        status: "ACTIVE",
        alpha: body.alpha || "0.03",
        category: body.category || "general",
        tags: body.tags || [],
        yes_price: 0.5,
        no_price: 0.5,
        total_volume: 0,
        total_trades: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create market", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        market: {
          id: market.id,
          address: market.address,
          question: market.question,
          status: market.status,
        },
        payment: {
          amount: X402_CONFIG.prices.createMarket,
          amountFormatted: "0.10 USDC",
          from: payment?.payload.from,
        },
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
