// Edge Function: x402-forum-link-trade
// Link a trade tx to a post or comment - x402 protected (0.01 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handlePayment } from "../_shared/x402.ts";

const ENDPOINT = "x402-forum-link-trade";

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
    const { post_id, comment_id, tx_hash, market_address, direction, outcome, amount } = body;

    // Handle x402 payment
    const paymentResult = await handlePayment(req, ENDPOINT, { post_id, comment_id, tx_hash });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Validate inputs
    if (!post_id && !comment_id) {
      return new Response(
        JSON.stringify({ error: "post_id or comment_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tx_hash || typeof tx_hash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(tx_hash)) {
      return new Response(
        JSON.stringify({ error: "Valid tx_hash required (0x + 64 hex chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!market_address || !/^0x[a-fA-F0-9]{40}$/.test(market_address)) {
      return new Response(
        JSON.stringify({ error: "Valid market_address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Insert attribution
    const { data: attribution, error } = await supabase
      .from("forum_attributions")
      .insert({
        post_id: post_id || null,
        comment_id: comment_id || null,
        author_wallet: paymentResult.payerAddress.toLowerCase(),
        tx_hash,
        market_address,
        direction: direction || null,
        outcome: outcome || null,
        amount: amount || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to link trade" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        attribution,
        payment: {
          amount: "10000",
          amountFormatted: "0.01 USDC",
          payer: paymentResult.payerAddress,
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
