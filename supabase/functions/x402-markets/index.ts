// Edge Function: x402-markets
// List all markets - x402 protected (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

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
    // Handle x402 payment (verify, settle, and log)
    const paymentResult = await handlePayment(req, "x402-markets");
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Parse query parameters
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");
    const creator = url.searchParams.get("creator");
    const resolved = url.searchParams.get("resolved");
    const sort = url.searchParams.get("sort") || "created_at";
    const order = url.searchParams.get("order") || "desc";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

    // Map sort param to DB column
    const sortColumnMap: Record<string, string> = {
      created_at: "created_at",
      volume: "total_volume",
      resolution_time: "resolution_time",
    };
    const sortColumn = sortColumnMap[sort] || "created_at";
    const ascending = order === "asc";

    // Fetch markets from database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabase
      .from("markets")
      .select("*", { count: "exact" });

    // Apply filters
    if (status) {
      query = query.eq("status", status.toUpperCase());
    }
    if (category) {
      query = query.eq("category", category);
    }
    if (creator) {
      query = query.ilike("creator_address", creator);
    }
    if (resolved !== null) {
      query = query.eq("resolved", resolved === "true");
    }

    // Apply sort, pagination
    query = query
      .order(sortColumn, { ascending })
      .range(offset, offset + limit - 1);

    const { data: markets, error, count } = await query;

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch markets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        markets: markets || [],
        count: markets?.length || 0,
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
