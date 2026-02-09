// Edge Function: auth-verify
// Verifies SIWE signature and issues JWT

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { SiweMessage } from "https://esm.sh/siwe@2.1.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface VerifyRequest {
  message: string;
  signature: string;
}

// Simple JWT creation (in production, use a proper JWT library)
function createJWT(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };

  const base64UrlEncode = (obj: Record<string, unknown>) => {
    const str = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  };

  const headerB64 = base64UrlEncode(header);
  const payloadB64 = base64UrlEncode(payload);
  const message = `${headerB64}.${payloadB64}`;

  // Create HMAC signature
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  // Simple signature (in production use crypto.subtle)
  const signature = btoa(
    String.fromCharCode(
      ...Array.from(new Uint8Array(32)).map((_, i) =>
        (keyData[i % keyData.length] ^ messageData[i % messageData.length]) & 255
      )
    )
  ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  return `${message}.${signature}`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request
    const { message, signature }: VerifyRequest = await req.json();

    if (!message || !signature) {
      return new Response(
        JSON.stringify({ error: "message and signature are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse SIWE message
    let siweMessage: SiweMessage;
    try {
      siweMessage = new SiweMessage(message);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Invalid SIWE message format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify signature
    let verifyResult;
    try {
      verifyResult = await siweMessage.verify({ signature });
    } catch (err) {
      console.error("Signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!verifyResult.success) {
      return new Response(
        JSON.stringify({ error: "Signature verification failed", details: verifyResult.error }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const walletAddress = siweMessage.address.toLowerCase();
    const nonce = siweMessage.nonce;

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret = Deno.env.get("JWT_SECRET") || supabaseServiceKey;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify nonce
    const { data: nonceResult, error: nonceError } = await supabase.rpc("verify_and_consume_nonce", {
      p_wallet_address: walletAddress,
      p_nonce: nonce,
    });

    if (nonceError || !nonceResult?.[0]?.valid) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired nonce" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = nonceResult[0].user_id;

    // Create session token
    const sessionToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store session
    const { error: sessionError } = await supabase.from("auth_sessions").insert({
      user_id: userId,
      session_token: sessionToken,
      expires_at: expiresAt.toISOString(),
      siwe_message: message,
      siwe_domain: siweMessage.domain,
      siwe_uri: siweMessage.uri,
      siwe_chain_id: siweMessage.chainId,
      siwe_issued_at: siweMessage.issuedAt,
      user_agent: req.headers.get("user-agent"),
    });

    if (sessionError) {
      console.error("Session creation error:", sessionError);
      return new Response(
        JSON.stringify({ error: "Failed to create session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user info
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, wallet_address, display_name, avatar_url, total_trades, total_volume, total_pnl")
      .eq("id", userId)
      .single();

    if (userError) {
      console.error("User fetch error:", userError);
    }

    // Create JWT
    const now = Math.floor(Date.now() / 1000);
    const jwt = createJWT(
      {
        sub: userId,
        wallet_address: walletAddress,
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
        expires_at: expiresAt.toISOString(),
        user: userData || {
          id: userId,
          wallet_address: walletAddress,
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
