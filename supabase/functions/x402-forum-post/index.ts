// Edge Function: x402-forum-post
// Get a single post by ID with comments and attributions - x402 protected (0.01 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const ENDPOINT = "x402-forum-post";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const paymentResult = await handlePayment(req, ENDPOINT);
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    const url = new URL(req.url);
    const postId = url.searchParams.get("id");

    if (!postId) {
      return new Response(
        JSON.stringify({ error: "id query parameter is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch post
    const { data: post, error: postError } = await supabase
      .from("forum_posts")
      .select("*")
      .eq("id", postId)
      .eq("is_deleted", false)
      .single();

    if (postError || !post) {
      return new Response(
        JSON.stringify({ error: "Post not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch first 20 comments and attributions in parallel
    const [commentsResult, attributionsResult] = await Promise.all([
      supabase
        .from("forum_comments")
        .select("*")
        .eq("post_id", postId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .limit(20),
      supabase
        .from("forum_attributions")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: false }),
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        post,
        comments: commentsResult.data || [],
        attributions: attributionsResult.data || [],
        payment: {
          amount: X402_CONFIG.price,
          amountFormatted: X402_CONFIG.priceFormatted,
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
