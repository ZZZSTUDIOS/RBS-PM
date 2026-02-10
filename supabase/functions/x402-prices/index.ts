// Edge Function: x402-prices
// Get market prices - x402 protected (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createPublicClient, http } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const LSLMSR_ABI = [
  { name: "getYesPrice", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getNoPrice", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getYesProbability", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getNoProbability", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const market = url.searchParams.get("market");

    if (!market || !/^0x[a-fA-F0-9]{40}$/.test(market)) {
      return new Response(
        JSON.stringify({ error: "Valid market address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle x402 payment (verify, settle, and log)
    const paymentResult = await handlePayment(req, "x402-prices", { market });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Query blockchain
    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const [yesPrice, noPrice, yesProbability, noProbability] = await Promise.all([
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "getYesPrice" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "getNoPrice" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "getYesProbability" }),
      client.readContract({ address: market as `0x${string}`, abi: LSLMSR_ABI, functionName: "getNoProbability" }),
    ]);

    const yes = Number(yesPrice) / 1e18;
    const no = Number(noPrice) / 1e18;

    return new Response(
      JSON.stringify({
        success: true,
        market,
        prices: {
          yes,
          no,
          yesFormatted: `${(yes * 100).toFixed(1)}%`,
          noFormatted: `${(no * 100).toFixed(1)}%`,
        },
        probability: {
          yes: Number(yesProbability) / 1e18,
          no: Number(noProbability) / 1e18,
        },
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
