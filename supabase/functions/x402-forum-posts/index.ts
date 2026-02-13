// Edge Function: x402-forum-posts
// List forum posts (paginated) - x402 protected (0.01 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const ENDPOINT = "x402-forum-posts";

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
    const market = url.searchParams.get("market");
    const wallet = url.searchParams.get("wallet");
    const tag = url.searchParams.get("tag");
    const sort = url.searchParams.get("sort") || "created_at";
    const order = url.searchParams.get("order") || "desc";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "25", 10) || 25, 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

    const sortMap: Record<string, string> = {
      created_at: "created_at",
      upvotes: "upvotes",
      comments: "comment_count",
    };
    const sortColumn = sortMap[sort] || "created_at";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from("forum_posts")
      .select("*", { count: "exact" })
      .eq("is_deleted", false);

    if (market) query = query.eq("market_address", market);
    if (wallet) query = query.ilike("author_wallet", wallet);
    if (tag) query = query.contains("tags", [tag]);

    query = query
      .order(sortColumn, { ascending: order === "asc" })
      .range(offset, offset + limit - 1);

    const { data: posts, error, count } = await query;

    if (error) {
      console.error("Query error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch posts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        posts: posts || [],
        count: posts?.length || 0,
        total: count ?? 0,
        limit,
        offset,
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
