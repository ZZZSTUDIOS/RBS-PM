// Edge Function: x402-forum-create-comment
// Create a comment on a forum post - x402 protected (0.01 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handlePayment } from "../_shared/x402.ts";

const ENDPOINT = "x402-forum-create-comment";

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
    const { post_id, body: commentBody, parent_comment_id } = body;

    // Handle x402 payment
    const paymentResult = await handlePayment(req, ENDPOINT, { post_id });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Validate inputs
    if (!post_id || typeof post_id !== "string") {
      return new Response(
        JSON.stringify({ error: "post_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!commentBody || typeof commentBody !== "string" || commentBody.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "body is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (commentBody.length > 5000) {
      return new Response(
        JSON.stringify({ error: "body must be 5000 characters or less" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limit check
    const { data: allowed } = await supabase.rpc("check_forum_rate_limit", {
      p_wallet: paymentResult.payerAddress.toLowerCase(),
      p_action: "comment",
    });

    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded: max 60 comments per 24 hours" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify post exists
    const { data: post } = await supabase
      .from("forum_posts")
      .select("id")
      .eq("id", post_id)
      .eq("is_deleted", false)
      .single();

    if (!post) {
      return new Response(
        JSON.stringify({ error: "Post not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reject duplicate comments (same wallet, same post, same body)
    const { data: duplicate } = await supabase
      .from("forum_comments")
      .select("id")
      .eq("post_id", post_id)
      .eq("author_wallet", paymentResult.payerAddress.toLowerCase())
      .eq("body", commentBody.trim())
      .eq("is_deleted", false)
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      return new Response(
        JSON.stringify({ error: "You already posted this exact comment on this post" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert comment
    const { data: comment, error } = await supabase
      .from("forum_comments")
      .insert({
        post_id,
        parent_comment_id: parent_comment_id || null,
        author_wallet: paymentResult.payerAddress.toLowerCase(),
        body: commentBody.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create comment" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        comment,
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
