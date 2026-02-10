// Edge Function: x402-resolve
// Get resolution calldata - x402 protected (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createPublicClient, http, encodeFunctionData } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const LSLMSR_ABI = [
  { name: "resolve", type: "function", inputs: [{ name: "_yesWins", type: "bool" }], outputs: [], stateMutability: "nonpayable" },
  { name: "oracle", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "resolved", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { name: "resolutionTime", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "question", type: "function", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
] as const;

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
    const { marketAddress, yesWins, callerAddress } = body;

    // Handle x402 payment (verify, settle, and log)
    const paymentResult = await handlePayment(req, "x402-resolve", { marketAddress, yesWins });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    if (!marketAddress || !/^0x[a-fA-F0-9]{40}$/.test(marketAddress)) {
      return new Response(
        JSON.stringify({ error: "Valid marketAddress required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof yesWins !== "boolean") {
      return new Response(
        JSON.stringify({ error: "yesWins (boolean) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const market = marketAddress as `0x${string}`;

    // Check market state
    const [oracle, resolved, resolutionTime, question] = await Promise.all([
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "oracle" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "resolved" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "resolutionTime" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "question" }),
    ]);

    const now = Math.floor(Date.now() / 1000);
    const resTime = Number(resolutionTime);

    // Validation checks
    const checks = {
      isOracle: callerAddress ? oracle.toLowerCase() === callerAddress.toLowerCase() : null,
      isResolved: resolved,
      canResolve: now >= resTime,
      resolutionTime: resTime,
      resolutionDate: new Date(resTime * 1000).toISOString(),
    };

    if (resolved) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Market already resolved",
          checks,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (now < resTime) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Resolution time not reached. Can resolve after ${checks.resolutionDate}`,
          checks,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate calldata
    const resolveData = encodeFunctionData({
      abi: LSLMSR_ABI,
      functionName: "resolve",
      args: [yesWins],
    });

    return new Response(
      JSON.stringify({
        success: true,
        market: marketAddress,
        question,
        outcome: yesWins ? "YES" : "NO",
        oracle,
        checks,
        transaction: {
          to: marketAddress,
          data: resolveData,
          description: `Resolve market: ${yesWins ? "YES" : "NO"} wins`,
        },
        note: "Only the oracle address can execute this transaction",
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
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
