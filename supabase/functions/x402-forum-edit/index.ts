// Edge Function: x402-forum-edit
// Edit a post or comment body - x402 protected (0.01 USDC)
// Author must match the payer address.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handlePayment } from "../_shared/x402.ts";

const ENDPOINT = "x402-forum-edit";

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
    const { id, type, body: newBody } = body;

    // Handle x402 payment
    const paymentResult = await handlePayment(req, ENDPOINT, { id, type });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Validate inputs
    if (!id || typeof id !== "string") {
      return new Response(
        JSON.stringify({ error: "id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!type || !["post", "comment"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "type must be 'post' or 'comment'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!newBody || typeof newBody !== "string" || newBody.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "body is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const maxLen = type === "post" ? 10000 : 5000;
    if (newBody.length > maxLen) {
      return new Response(
        JSON.stringify({ error: `body must be ${maxLen} characters or less` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limit check
    const { data: allowed } = await supabase.rpc("check_forum_rate_limit", {
      p_wallet: paymentResult.payerAddress.toLowerCase(),
      p_action: "edit",
    });

    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded: max 20 edits per 24 hours" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const table = type === "post" ? "forum_posts" : "forum_comments";

    // Verify author
    const { data: existing } = await supabase
      .from(table)
      .select("author_wallet")
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existing.author_wallet !== paymentResult.payerAddress.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Forbidden: you can only edit your own content" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update
    const { data: updated, error } = await supabase
      .from(table)
      .update({ body: newBody.trim(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Update error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to edit" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        [type]: updated,
        payment: {
          amount: "10000",
          amountFormatted: "0.01 USDC",
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
