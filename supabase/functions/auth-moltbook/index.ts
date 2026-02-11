// Edge Function: auth-moltbook
// Verifies Moltbook identity token and creates agent session

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Moltbook API endpoints
const MOLTBOOK_VERIFY_URL = "https://moltbook.com/api/v1/agents/verify-identity";

interface MoltbookVerifyRequest {
  identity_token: string;
  audience?: string;
}

interface MoltbookAgent {
  id: string;
  name: string;
  karma: number;
  owner: {
    address: string;
  };
  created_at: string;
}

// Minimum karma required to use the prediction market
const MIN_KARMA_THRESHOLD = 100;

async function createJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };

  const base64UrlEncode = (data: Uint8Array) => {
    return btoa(String.fromCharCode(...data))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const message = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const signature = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${message}.${signature}`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request
    const { identity_token, audience }: MoltbookVerifyRequest = await req.json();

    if (!identity_token) {
      return new Response(
        JSON.stringify({ error: "identity_token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify with Moltbook
    const moltbookResponse = await fetch(MOLTBOOK_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: identity_token,
        audience: audience || "prediction-market-rbs",
      }),
    });

    if (!moltbookResponse.ok) {
      const errorText = await moltbookResponse.text();
      console.error("Moltbook verification failed:", moltbookResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Invalid identity token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const moltbookData: MoltbookAgent = await moltbookResponse.json();
    console.log("Moltbook agent verified:", moltbookData.id, moltbookData.name);

    // Check karma threshold
    if (moltbookData.karma < MIN_KARMA_THRESHOLD) {
      return new Response(
        JSON.stringify({
          error: "Insufficient karma",
          required: MIN_KARMA_THRESHOLD,
          current: moltbookData.karma,
          message: `Agent must have at least ${MIN_KARMA_THRESHOLD} karma to use the prediction market`,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) {
      console.error("JWT_SECRET environment variable is required");
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get or create agent in database
    const { data: agentResult, error: agentError } = await supabase.rpc("get_or_create_agent_moltbook", {
      p_moltbook_id: moltbookData.id,
      p_moltbook_name: moltbookData.name,
      p_moltbook_karma: moltbookData.karma,
      p_controller_address: moltbookData.owner.address,
    });

    if (agentError) {
      console.error("Failed to create/get agent:", agentError);
      return new Response(
        JSON.stringify({ error: "Failed to create agent record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agent = agentResult?.[0];
    if (!agent) {
      return new Response(
        JSON.stringify({ error: "Failed to get agent data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Agent ${agent.is_new ? "created" : "found"}:`, agent.id);

    // Create session token
    const sessionToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Create agent session
    const { data: sessionResult, error: sessionError } = await supabase.rpc("create_agent_session", {
      p_agent_id: agent.id,
      p_session_token: sessionToken,
      p_auth_method: "moltbook",
      p_expires_in_hours: 24,
    });

    if (sessionError) {
      console.error("Failed to create session:", sessionError);
      return new Response(
        JSON.stringify({ error: "Failed to create session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const session = sessionResult?.[0];
    if (!session) {
      return new Response(
        JSON.stringify({ error: "Failed to get session data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create JWT
    const now = Math.floor(Date.now() / 1000);
    const jwt = await createJWT(
      {
        sub: agent.id,
        type: "agent",
        auth_method: "moltbook",
        moltbook_id: moltbookData.id,
        controller_address: moltbookData.owner.address,
        iat: now,
        exp: now + 24 * 60 * 60, // 24 hours
        aud: "authenticated",
        role: "authenticated",
      },
      jwtSecret
    );

    return new Response(
      JSON.stringify({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 24 * 60 * 60,
        expires_at: session.expires_at,
        agent: {
          id: agent.id,
          moltbook_id: agent.moltbook_id,
          moltbook_name: agent.moltbook_name,
          moltbook_karma: agent.moltbook_karma,
          controller_address: agent.controller_address,
          is_new: agent.is_new,
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
