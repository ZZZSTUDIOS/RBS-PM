// Edge Function: x402-agent-status
// Free endpoint — returns agent reputation, tier, and health status.
// No x402 payment required (agents need to check status without paying).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/x402.ts";

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
    const url = new URL(req.url);
    const wallet = url.searchParams.get("wallet");

    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid wallet parameter (0x... address)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("agent_reputation_summary")
      .select("*")
      .eq("agent_wallet", wallet.toLowerCase())
      .single();

    if (error || !data) {
      // No reputation data — return unranked defaults
      return new Response(
        JSON.stringify({
          wallet: wallet.toLowerCase(),
          reputation: 0,
          tier: "unranked",
          healthy: false,
          lastActive: null,
          totalCalls: 0,
          breakdown: { trades: 0, marketCreations: 0, resolutions: 0 },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        wallet: data.agent_wallet,
        reputation: data.total_reputation,
        tier: data.tier,
        healthy: data.healthy,
        lastActive: data.last_active,
        totalCalls: data.total_x402_calls,
        breakdown: {
          trades: data.trade_calls,
          marketCreations: data.market_creation_calls,
          resolutions: data.resolution_calls,
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
