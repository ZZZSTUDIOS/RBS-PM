// Edge Function: x402-create-market
// Market creation/indexing endpoint protected by x402 micropayments
// Costs 0.0001 USDC to list a market in the app
// Uses x402 v2 protocol with the Monad facilitator

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logPayment, corsHeaders } from "../_shared/x402.ts";

// x402 Configuration
// USDC contract address on Monad Testnet
const USDC_ADDRESS = "0x534b2f3A21130d7a60830c2Df862319e593943A3";

const X402_CONFIG = {
  version: 2,
  network: "eip155:10143",
  facilitator: "https://x402-facilitator.molandak.org",
  scheme: "exact",
  asset: USDC_ADDRESS, // Use contract address, not symbol
  maxTimeoutSeconds: 3600,
  prices: {
    createMarket: "100", // 0.0001 USDC (6 decimals)
  },
  // Protocol fee recipient
  recipient: "0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE",
  // EIP-712 domain for USDC TransferWithAuthorization
  // Monad USDC uses 'USDC' (not 'USD Coin')
  usdcDomain: {
    name: "USDC",
    version: "2",
    chainId: 10143,
    verifyingContract: USDC_ADDRESS,
  },
};

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

// Base64 encode/decode helpers
function safeBase64Encode(str: string): string {
  return btoa(str);
}

function safeBase64Decode(str: string): string {
  return atob(str);
}

// Create x402 v2 payment required response
function createPaymentRequiredResponse(url: string, error?: string) {
  const paymentRequired = {
    x402Version: X402_CONFIG.version,
    error: error,
    resource: {
      url: url,
      description: "Market creation listing fee",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: X402_CONFIG.scheme,
        network: X402_CONFIG.network,
        amount: X402_CONFIG.prices.createMarket,
        asset: X402_CONFIG.asset,
        payTo: X402_CONFIG.recipient,
        maxTimeoutSeconds: X402_CONFIG.maxTimeoutSeconds,
        extra: {
          name: X402_CONFIG.usdcDomain.name,
          version: X402_CONFIG.usdcDomain.version,
          chainId: X402_CONFIG.usdcDomain.chainId,
          verifyingContract: X402_CONFIG.usdcDomain.verifyingContract,
        },
      },
    ],
  };

  return {
    header: safeBase64Encode(JSON.stringify(paymentRequired)),
    body: paymentRequired,
  };
}

// Parse x402 v2 payment signature header
function parsePaymentSignature(header: string): { x402Version: number; accepted: unknown; payload: unknown } | null {
  try {
    const decoded = safeBase64Decode(header);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// Verify and settle payment with facilitator
async function verifyAndSettlePayment(
  paymentPayload: unknown,
  paymentRequirements: unknown
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log("Verifying payment with facilitator...");

    // First verify
    const verifyResponse = await fetch(`${X402_CONFIG.facilitator}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: X402_CONFIG.version,
        paymentPayload,
        paymentRequirements,
      }),
    });

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error("Verify failed:", verifyResponse.status, errorText);
      return { success: false, error: `Verification failed: ${errorText}` };
    }

    const verifyResult = await verifyResponse.json();
    console.log("Verify result:", verifyResult);

    if (!verifyResult.isValid) {
      return { success: false, error: verifyResult.invalidReason || "Invalid payment" };
    }

    // Then settle
    console.log("Settling payment with facilitator...");
    const settleResponse = await fetch(`${X402_CONFIG.facilitator}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: X402_CONFIG.version,
        paymentPayload,
        paymentRequirements,
      }),
    });

    if (!settleResponse.ok) {
      const errorText = await settleResponse.text();
      console.error("Settle failed:", settleResponse.status, errorText);
      return { success: false, error: `Settlement failed: ${errorText}` };
    }

    const settleResult = await settleResponse.json();
    console.log("Settle result:", settleResult);

    if (!settleResult.success) {
      return { success: false, error: settleResult.error || "Settlement failed" };
    }

    return {
      success: true,
      txHash: settleResult.txHash || settleResult.transactionHash,
    };
  } catch (err) {
    console.error("Payment processing error:", err);
    return { success: false, error: `Error: ${err}` };
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

  const url = req.url;

  try {
    // Check for payment signature header (x402 v2 uses PAYMENT-SIGNATURE)
    const paymentSignatureHeader = req.headers.get("PAYMENT-SIGNATURE") || req.headers.get("X-Payment");

    if (!paymentSignatureHeader) {
      // Return 402 with x402 v2 payment required
      const { header, body } = createPaymentRequiredResponse(url);

      return new Response(
        JSON.stringify({
          ...body,
          error: "Payment required",
          amountFormatted: "0.0001 USDC",
          description: "Market creation requires a 0.0001 USDC listing fee",
        }),
        {
          status: 402,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "PAYMENT-REQUIRED": header,
          },
        }
      );
    }

    // Parse payment signature
    const paymentPayload = parsePaymentSignature(paymentSignatureHeader);

    if (!paymentPayload) {
      const { header } = createPaymentRequiredResponse(url, "Invalid payment signature format");
      return new Response(
        JSON.stringify({ error: "Invalid payment signature format" }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json", "PAYMENT-REQUIRED": header },
        }
      );
    }

    // Build payment requirements for verification
    const paymentRequirements = {
      scheme: X402_CONFIG.scheme,
      network: X402_CONFIG.network,
      amount: X402_CONFIG.prices.createMarket,
      asset: X402_CONFIG.asset,
      payTo: X402_CONFIG.recipient,
      maxTimeoutSeconds: X402_CONFIG.maxTimeoutSeconds,
      extra: {
        name: X402_CONFIG.usdcDomain.name,
        version: X402_CONFIG.usdcDomain.version,
        chainId: X402_CONFIG.usdcDomain.chainId,
        verifyingContract: X402_CONFIG.usdcDomain.verifyingContract,
      },
    };

    // Verify and settle with facilitator
    const settlement = await verifyAndSettlePayment(paymentPayload, paymentRequirements);

    if (!settlement.success) {
      const { header } = createPaymentRequiredResponse(url, settlement.error);
      return new Response(
        JSON.stringify({ error: "Payment failed", details: settlement.error }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json", "PAYMENT-REQUIRED": header },
        }
      );
    }

    console.log("Payment settled, txHash:", settlement.txHash);

    // Parse request body
    const body = await req.json() as MarketCreateRequest;

    // Get payer address for logging
    const payerAddressForLogging = (paymentPayload.payload as { authorization?: { from?: string } })?.authorization?.from || "unknown";

    // Log payment to database
    logPayment(
      "x402-create-market",
      payerAddressForLogging,
      { address: body.address, question: body.question },
      true,
      settlement.txHash
    );

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

    // Get payer address from payment payload
    const payerAddress = (paymentPayload.payload as { authorization?: { from?: string } })?.authorization?.from || body.oracle;

    // Insert the market
    const { data: market, error: insertError } = await supabase
      .from("markets")
      .insert({
        address: body.address.toLowerCase(),
        question: body.question,
        resolution_time: new Date(body.resolutionTime * 1000).toISOString(),
        oracle_address: body.oracle.toLowerCase(),
        creator_address: payerAddress.toLowerCase(),
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
          amountFormatted: "0.0001 USDC",
          txHash: settlement.txHash,
          settled: true,
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
