// Edge Function: x402-redeem
// Get redeem calldata for claiming winnings - x402 protected (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createPublicClient, http, encodeFunctionData, formatUnits } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const LSLMSR_ABI = [
  { name: "redeem", type: "function", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { name: "resolved", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { name: "yesWins", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { name: "yesToken", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "noToken", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "question", type: "function", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { name: "collateralDecimals", type: "function", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
] as const;

const ERC20_ABI = [
  { name: "balanceOf", type: "function", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
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
    const { marketAddress, userAddress } = body;

    // Handle x402 payment
    const paymentResult = await handlePayment(req, "x402-redeem", { marketAddress, userAddress });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    if (!marketAddress || !/^0x[a-fA-F0-9]{40}$/.test(marketAddress)) {
      return new Response(
        JSON.stringify({ error: "Valid marketAddress required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return new Response(
        JSON.stringify({ error: "Valid userAddress required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const market = marketAddress as `0x${string}`;
    const user = userAddress as `0x${string}`;

    // Check market state
    const [resolved, yesWins, yesToken, noToken, question, decimals] = await Promise.all([
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "resolved" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "yesWins" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "yesToken" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "noToken" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "question" }),
      client.readContract({ address: market, abi: LSLMSR_ABI, functionName: "collateralDecimals" }),
    ]);

    if (!resolved) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Market not resolved yet",
          resolved: false,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check user's winning token balance
    const winningToken = yesWins ? yesToken : noToken;
    const losingToken = yesWins ? noToken : yesToken;

    const [winningBalance, losingBalance] = await Promise.all([
      client.readContract({ address: winningToken as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [user] }),
      client.readContract({ address: losingToken as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [user] }),
    ]);

    if (winningBalance === 0n) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No winning shares to redeem",
          resolved: true,
          outcome: yesWins ? "YES" : "NO",
          winningShares: "0",
          losingShares: formatUnits(losingBalance as bigint, 18),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate redeem calldata
    const redeemData = encodeFunctionData({
      abi: LSLMSR_ABI,
      functionName: "redeem",
      args: [],
    });

    // Calculate payout (1 winning share = 1 collateral unit)
    const payout = winningBalance as bigint;

    return new Response(
      JSON.stringify({
        success: true,
        market: marketAddress,
        question,
        resolved: true,
        outcome: yesWins ? "YES" : "NO",
        user: userAddress,
        position: {
          winningShares: formatUnits(winningBalance as bigint, 18),
          losingShares: formatUnits(losingBalance as bigint, 18),
          payout: formatUnits(payout, Number(decimals)),
          payoutFormatted: `${formatUnits(payout, Number(decimals))} USDC`,
        },
        transaction: {
          to: marketAddress,
          data: redeemData,
          description: `Redeem ${formatUnits(winningBalance as bigint, 18)} winning shares for ${formatUnits(payout, Number(decimals))} USDC`,
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
