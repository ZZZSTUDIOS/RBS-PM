// Edge Function: x402-forum-create-post
// Create a forum post - x402 protected (0.02 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  corsHeaders,
  verifyAndSettlePayment,
  logPayment,
  recordReputation,
  X402_CONFIG,
} from "../_shared/x402.ts";

const PRICE = "20000"; // 0.02 USDC
const PRICE_FORMATTED = "0.02 USDC";
const ENDPOINT = "x402-forum-create-post";

function createPaymentRequiredResponse(): Response {
  const paymentDetails = {
    x402Version: X402_CONFIG.version,
    accepts: [
      {
        scheme: X402_CONFIG.scheme,
        network: X402_CONFIG.network,
        amount: PRICE,
        asset: X402_CONFIG.asset,
        payTo: X402_CONFIG.recipient,
        maxTimeoutSeconds: X402_CONFIG.maxTimeoutSeconds,
        extra: X402_CONFIG.extra,
      },
    ],
  };

  return new Response(
    JSON.stringify({
      error: "Payment required",
      amount: PRICE,
      amountFormatted: PRICE_FORMATTED,
      asset: "USDC",
      network: X402_CONFIG.network,
    }),
    {
      status: 402,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": btoa(JSON.stringify(paymentDetails)),
      },
    }
  );
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
    const body = await req.json();
    const { title, body: postBody, market_address, tags } = body;

    // Handle x402 payment
    const paymentSignature = req.headers.get("PAYMENT-SIGNATURE");
    if (!paymentSignature) {
      return createPaymentRequiredResponse();
    }

    const verification = await verifyAndSettlePayment(paymentSignature);
    if (!verification.valid) {
      return new Response(
        JSON.stringify({ error: "Payment verification failed" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payerAddress = verification.payerAddress || "unknown";

    // Log payment and reputation in background
    logPayment(ENDPOINT, payerAddress, { title }, verification.settled || false, verification.settlementTxHash, paymentSignature.substring(0, 100))
      .catch(err => console.error("Payment log failed:", err));
    recordReputation(payerAddress, ENDPOINT)
      .catch(err => console.error("Reputation record failed:", err));

    // Validate inputs
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!postBody || typeof postBody !== "string" || postBody.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "body is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (title.length > 300) {
      return new Response(
        JSON.stringify({ error: "title must be 300 characters or less" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (postBody.length > 10000) {
      return new Response(
        JSON.stringify({ error: "body must be 10000 characters or less" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit check
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: allowed } = await supabase.rpc("check_forum_rate_limit", {
      p_wallet: payerAddress.toLowerCase(),
      p_action: "post",
    });

    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded: max 5 posts per 24 hours" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert post
    const { data: post, error } = await supabase
      .from("forum_posts")
      .insert({
        author_wallet: payerAddress.toLowerCase(),
        title: title.trim(),
        body: postBody.trim(),
        market_address: market_address || null,
        tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create post" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        post,
        payment: {
          amount: PRICE,
          amountFormatted: PRICE_FORMATTED,
          payer: payerAddress,
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
