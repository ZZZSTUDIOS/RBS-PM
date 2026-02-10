// Edge Function: x402-claim-fees
// Get fee claiming calldata - x402 protected (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createPublicClient, http, encodeFunctionData, formatUnits } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const LSLMSR_ABI = [
  { name: "claimCreatorFees", type: "function", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { name: "withdrawExcessCollateral", type: "function", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { name: "marketCreator", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "resolved", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { name: "collateralDecimals", type: "function", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { name: "totalCollateral", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    name: "getFeeInfo",
    type: "function",
    inputs: [],
    outputs: [{ name: "pendingCreatorFees", type: "uint256" }],
    stateMutability: "view",
  },
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
    const { marketAddress, callerAddress } = body;

    // Handle x402 payment (verify, settle, and log)
    const paymentResult = await handlePayment(req, "x402-claim-fees", { marketAddress });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    if (!marketAddress || !/^0x[a-fA-F0-9]{40}$/.test(marketAddress)) {
      return new Response(
        JSON.stringify({ error: "Valid marketAddress required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const market = marketAddress as `0x${string}`;

    const [marketCreator, resolved, collateralDecimals, totalCollateral, feeInfo] = await Promise.all([
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "marketCreator" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "resolved" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "collateralDecimals" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "totalCollateral" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "getFeeInfo" }),
    ]);

    const decimals = Number(collateralDecimals);
    // getFeeInfo now returns single value: pendingCreatorFees
    const pendingFees = feeInfo as unknown as bigint;
    const isCreator = callerAddress ? marketCreator.toLowerCase() === callerAddress.toLowerCase() : null;

    const transactions = [];

    // Claim creator fees if available
    if (pendingFees > 0n) {
      const claimData = encodeFunctionData({
        abi: LSLMSR_ABI,
        functionName: "claimCreatorFees",
        args: [],
      });

      transactions.push({
        to: marketAddress,
        data: claimData,
        description: `Claim ${formatUnits(pendingFees, decimals)} USDC in creator fees`,
        type: "claimCreatorFees",
      });
    }

    // Withdraw excess collateral if resolved and has collateral
    if (resolved && totalCollateral > 0n) {
      const withdrawData = encodeFunctionData({
        abi: LSLMSR_ABI,
        functionName: "withdrawExcessCollateral",
        args: [],
      });

      transactions.push({
        to: marketAddress,
        data: withdrawData,
        description: `Withdraw ${formatUnits(totalCollateral, decimals)} USDC excess collateral`,
        type: "withdrawExcessCollateral",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        market: marketAddress,
        marketCreator,
        isCreator,
        resolved,
        fees: {
          pending: pendingFees.toString(),
          pendingFormatted: `${formatUnits(pendingFees, decimals)} USDC`,
          // Note: 0.5% trading fee goes 100% to market creator (no protocol fee)
        },
        excessCollateral: {
          amount: totalCollateral.toString(),
          amountFormatted: `${formatUnits(totalCollateral, decimals)} USDC`,
          canWithdraw: resolved,
        },
        transactions,
        note: transactions.length === 0
          ? "No fees to claim or collateral to withdraw"
          : "Only the market creator can execute these transactions",
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
