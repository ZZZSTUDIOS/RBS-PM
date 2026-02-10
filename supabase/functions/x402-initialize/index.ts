// Edge Function: x402-initialize
// Get initialize calldata for market initialization - x402 protected (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createPublicClient, http, encodeFunctionData, parseUnits } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const USDC_ADDRESS = "0x534b2f3A21130d7a60830c2Df862319e593943A3";

const LSLMSR_ABI = [
  { name: "initialize", type: "function", inputs: [{ name: "_initialLiquidity", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { name: "initialized", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { name: "question", type: "function", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { name: "collateralToken", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "collateralDecimals", type: "function", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { name: "marketCreator", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
] as const;

const ERC20_ABI = [
  { name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
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
    const { marketAddress, initialLiquidity, callerAddress } = body;

    // Handle x402 payment
    const paymentResult = await handlePayment(req, "x402-initialize", { marketAddress, initialLiquidity });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    if (!marketAddress || !/^0x[a-fA-F0-9]{40}$/.test(marketAddress)) {
      return new Response(
        JSON.stringify({ error: "Valid marketAddress required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!initialLiquidity || isNaN(parseFloat(initialLiquidity))) {
      return new Response(
        JSON.stringify({ error: "Valid initialLiquidity (USDC amount) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const market = marketAddress as `0x${string}`;

    // Check market state
    const [initialized, question, collateralToken, decimals, marketCreator] = await Promise.all([
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "initialized" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "question" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "collateralToken" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "collateralDecimals" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "marketCreator" }),
    ]);

    if (initialized) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Market already initialized",
          initialized: true,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const liquidityAmount = parseUnits(initialLiquidity, Number(decimals));

    // Check if caller is market creator
    const isCreator = callerAddress
      ? (marketCreator as string).toLowerCase() === callerAddress.toLowerCase()
      : null;

    // Generate approval calldata
    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [market, liquidityAmount],
    });

    // Generate initialize calldata
    const initializeData = encodeFunctionData({
      abi: LSLMSR_ABI,
      functionName: "initialize",
      args: [liquidityAmount],
    });

    return new Response(
      JSON.stringify({
        success: true,
        market: marketAddress,
        question,
        initialized: false,
        marketCreator,
        isCreator,
        collateralToken,
        collateralDecimals: Number(decimals),
        initialLiquidity: {
          amount: liquidityAmount.toString(),
          formatted: `${initialLiquidity} USDC`,
        },
        transactions: [
          {
            step: 1,
            to: collateralToken,
            data: approveData,
            description: `Approve ${initialLiquidity} USDC for market contract`,
            type: "approve",
          },
          {
            step: 2,
            to: marketAddress,
            data: initializeData,
            description: `Initialize market with ${initialLiquidity} USDC liquidity`,
            type: "initialize",
          },
        ],
        note: "Execute transactions in order: approve first, then initialize",
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
