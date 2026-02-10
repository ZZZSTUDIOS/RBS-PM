// Shared x402 utilities for all edge functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

export const X402_CONFIG = {
  version: 2,
  network: "eip155:10143",
  facilitator: "https://x402-facilitator.molandak.org",
  scheme: "exact",
  asset: "0x534b2f3A21130d7a60830c2Df862319e593943A3", // USDC on Monad
  recipient: "0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE",
  price: "100", // 0.0001 USDC
  priceFormatted: "0.0001 USDC",
  maxTimeoutSeconds: 3600,
  // EIP-712 domain for USDC TransferWithAuthorization
  usdcDomain: {
    name: "USDC",
    version: "2",
    chainId: 10143,
    verifyingContract: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  },
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-payment, payment-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function createPaymentRequiredResponse(description: string): Response {
  const paymentDetails = {
    x402Version: X402_CONFIG.version,
    accepts: [
      {
        scheme: X402_CONFIG.scheme,
        network: X402_CONFIG.network,
        amount: X402_CONFIG.price,
        asset: X402_CONFIG.asset,
        payTo: X402_CONFIG.recipient,
        maxTimeoutSeconds: X402_CONFIG.maxTimeoutSeconds,
        extra: X402_CONFIG.usdcDomain,
      },
    ],
  };

  return new Response(
    JSON.stringify({
      error: "Payment required",
      amount: X402_CONFIG.price,
      amountFormatted: X402_CONFIG.priceFormatted,
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

// Payment requirements for facilitator
function getPaymentRequirements() {
  return {
    scheme: X402_CONFIG.scheme,
    network: X402_CONFIG.network,
    amount: X402_CONFIG.price,
    asset: X402_CONFIG.asset,
    payTo: X402_CONFIG.recipient,
    maxTimeoutSeconds: X402_CONFIG.maxTimeoutSeconds,
    extra: X402_CONFIG.usdcDomain,
  };
}

export interface PaymentVerificationResult {
  valid: boolean;
  error?: string;
  payerAddress?: string;
  settled?: boolean;
  settlementTxHash?: string;
}

export async function verifyAndSettlePayment(
  paymentSignatureHeader: string
): Promise<PaymentVerificationResult> {
  try {
    // Decode the payment signature header (base64 encoded JSON)
    let paymentPayload: unknown;
    try {
      paymentPayload = JSON.parse(atob(paymentSignatureHeader));
    } catch {
      // Try parsing as direct JSON if not base64
      try {
        paymentPayload = JSON.parse(paymentSignatureHeader);
      } catch {
        return { valid: false, error: "Invalid payment signature format" };
      }
    }

    console.log("Payment payload received:", JSON.stringify(paymentPayload).substring(0, 200));

    // Build the facilitator request
    const facilitatorRequest = {
      x402Version: X402_CONFIG.version,
      paymentPayload,
      paymentRequirements: getPaymentRequirements(),
    };

    // Verify the payment
    console.log("Verifying with facilitator...");
    const verifyResponse = await fetch(`${X402_CONFIG.facilitator}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(facilitatorRequest),
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.text();
      console.error("Verify failed:", verifyResponse.status, error);
      return { valid: false, error: `Verification failed: ${error}` };
    }

    const verifyResult = await verifyResponse.json();
    console.log("Verify result:", verifyResult);

    if (!verifyResult.isValid && !verifyResult.valid) {
      return { valid: false, error: verifyResult.invalidReason || "Invalid payment signature" };
    }

    // Extract payer address from the payment payload
    let payerAddress = "unknown";
    const payload = paymentPayload as { payload?: { authorization?: { from?: string } }; from?: string };
    if (payload.payload?.authorization?.from) {
      payerAddress = payload.payload.authorization.from;
    } else if (payload.from) {
      payerAddress = payload.from;
    }

    // Settle the payment
    let settled = false;
    let settlementTxHash: string | undefined;

    try {
      console.log("Settling with facilitator...");
      const settleResponse = await fetch(`${X402_CONFIG.facilitator}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(facilitatorRequest),
      });

      if (settleResponse.ok) {
        const settleResult = await settleResponse.json();
        console.log("Settle result:", settleResult);
        settled = settleResult.success !== false;
        settlementTxHash = settleResult.txHash || settleResult.transactionHash;
      } else {
        const settleError = await settleResponse.text();
        console.warn("Settlement failed:", settleResponse.status, settleError);
      }
    } catch (settleErr) {
      console.warn("Settlement error:", settleErr);
    }

    return {
      valid: true,
      payerAddress,
      settled,
      settlementTxHash,
    };
  } catch (err) {
    console.error("Payment verification error:", err);
    return { valid: false, error: String(err) };
  }
}

export async function logPayment(
  endpoint: string,
  payerAddress: string,
  requestParams: Record<string, unknown> | null,
  settled: boolean,
  settlementTxHash?: string,
  paymentHeader?: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.warn("Supabase credentials not available for payment logging");
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase.from("x402_payments").insert({
      endpoint,
      amount: X402_CONFIG.price,
      amount_formatted: X402_CONFIG.priceFormatted,
      payer_address: payerAddress.toLowerCase(),
      payment_header: paymentHeader || null,
      request_params: requestParams,
      settled,
      settlement_tx_hash: settlementTxHash || null,
      settled_at: settled ? new Date().toISOString() : null,
    });

    if (error) {
      console.error("Failed to log payment to DB:", error);
    } else {
      console.log(`x402 payment logged: ${endpoint} from ${payerAddress.substring(0, 10)}...`);
    }
  } catch (err) {
    // Don't fail the request if logging fails
    console.error("Failed to log payment:", err);
  }
}

// Combined verify + log helper
export async function handlePayment(
  req: Request,
  endpoint: string,
  requestParams: Record<string, unknown> | null = null
): Promise<{ success: true; payerAddress: string } | { success: false; response: Response }> {
  const paymentSignature = req.headers.get("PAYMENT-SIGNATURE");

  if (!paymentSignature) {
    return {
      success: false,
      response: createPaymentRequiredResponse(endpoint),
    };
  }

  const verification = await verifyAndSettlePayment(paymentSignature);

  if (!verification.valid) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: "Payment verification failed", details: verification.error }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  // Log the payment (don't await - run async to not slow down response)
  logPayment(
    endpoint,
    verification.payerAddress || "unknown",
    requestParams,
    verification.settled || false,
    verification.settlementTxHash,
    paymentSignature.substring(0, 100) // Store first 100 chars of header
  ).catch(err => console.error("Background payment log failed:", err));

  return {
    success: true,
    payerAddress: verification.payerAddress || "unknown",
  };
}
