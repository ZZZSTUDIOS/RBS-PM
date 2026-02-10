// Edge Function: x402-market-info
// Get full market information - x402 protected (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createPublicClient, http, formatUnits } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const LSLMSR_ABI = [
  {
    name: "getMarketInfo",
    type: "function",
    inputs: [],
    outputs: [
      { name: "_question", type: "string" },
      { name: "_resolutionTime", type: "uint256" },
      { name: "_oracle", type: "address" },
      { name: "_yesPrice", type: "uint256" },
      { name: "_noPrice", type: "uint256" },
      { name: "_yesProbability", type: "uint256" },
      { name: "_noProbability", type: "uint256" },
      { name: "_yesShares", type: "uint256" },
      { name: "_noShares", type: "uint256" },
      { name: "_totalCollateral", type: "uint256" },
      { name: "_liquidityParam", type: "uint256" },
      { name: "_priceSum", type: "uint256" },
      { name: "_resolved", type: "bool" },
      { name: "_yesWins", type: "bool" },
    ],
    stateMutability: "view",
  },
  { name: "marketCreator", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "initialized", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { name: "collateralDecimals", type: "function", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { name: "yesToken", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "noToken", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  {
    name: "getFeeInfo",
    type: "function",
    inputs: [],
    outputs: [{ name: "pendingCreatorFees", type: "uint256" }, { name: "protocolFeesSent", type: "uint256" }],
    stateMutability: "view",
  },
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
    const paymentResult = await handlePayment(req, "x402-market-info", { market });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const marketAddress = market as `0x${string}`;

    const [marketInfo, marketCreator, initialized, collateralDecimals, yesToken, noToken, feeInfo] = await Promise.all([
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "getMarketInfo" }),
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "marketCreator" }),
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "initialized" }),
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "collateralDecimals" }),
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "yesToken" }),
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "noToken" }),
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "getFeeInfo" }),
    ]);

    const decimals = Number(collateralDecimals);
    const now = Math.floor(Date.now() / 1000);
    const resolutionTime = Number(marketInfo[1]);

    return new Response(
      JSON.stringify({
        success: true,
        market: {
          address: market,
          question: marketInfo[0],
          resolutionTime: resolutionTime,
          resolutionDate: new Date(resolutionTime * 1000).toISOString(),
          canResolve: now >= resolutionTime && !marketInfo[12],
          oracle: marketInfo[2],
          marketCreator,
          initialized,
          resolved: marketInfo[12],
          yesWins: marketInfo[13],
        },
        tokens: {
          yesToken,
          noToken,
          collateralDecimals: decimals,
        },
        prices: {
          yes: Number(marketInfo[3]) / 1e18,
          no: Number(marketInfo[4]) / 1e18,
          yesFormatted: `${(Number(marketInfo[3]) / 1e16).toFixed(1)}%`,
          noFormatted: `${(Number(marketInfo[4]) / 1e16).toFixed(1)}%`,
        },
        probability: {
          yes: Number(marketInfo[5]) / 1e18,
          no: Number(marketInfo[6]) / 1e18,
        },
        shares: {
          yes: marketInfo[7].toString(),
          no: marketInfo[8].toString(),
        },
        liquidity: {
          totalCollateral: marketInfo[9].toString(),
          totalCollateralFormatted: formatUnits(marketInfo[9], decimals),
          liquidityParameter: marketInfo[10].toString(),
        },
        fees: {
          pendingCreatorFees: feeInfo[0].toString(),
          pendingCreatorFeesFormatted: formatUnits(feeInfo[0], decimals),
          protocolFeesSent: feeInfo[1].toString(),
          protocolFeesSentFormatted: formatUnits(feeInfo[1], decimals),
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
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
