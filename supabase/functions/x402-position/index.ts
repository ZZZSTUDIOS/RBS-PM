// Edge Function: x402-position
// Get user position in a market - x402 protected (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createPublicClient, http, formatUnits } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const LSLMSR_ABI = [
  { name: "yesToken", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "noToken", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "getYesPrice", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getNoPrice", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "collateralDecimals", type: "function", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
] as const;

const ERC20_ABI = [
  { name: "balanceOf", type: "function", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const market = url.searchParams.get("market");
    const user = url.searchParams.get("user");

    if (!market || !/^0x[a-fA-F0-9]{40}$/.test(market)) {
      return new Response(
        JSON.stringify({ error: "Valid market address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) {
      return new Response(
        JSON.stringify({ error: "Valid user address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle x402 payment (verify, settle, and log)
    const paymentResult = await handlePayment(req, "x402-position", { market, user });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const marketAddress = market as `0x${string}`;
    const userAddress = user as `0x${string}`;

    // Get token addresses and prices
    const [yesToken, noToken, yesPrice, noPrice, collateralDecimals] = await Promise.all([
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "yesToken" }),
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "noToken" }),
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "getYesPrice" }),
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "getNoPrice" }),
      client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "collateralDecimals" }),
    ]);

    // Get user balances
    const [yesShares, noShares] = await Promise.all([
      client.readContract({ address: yesToken as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [userAddress] }),
      client.readContract({ address: noToken as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [userAddress] }),
    ]);

    const yes = Number(yesPrice) / 1e18;
    const no = Number(noPrice) / 1e18;
    const decimals = Number(collateralDecimals);

    // Calculate values (shares are 1e18, prices are 1e18, result needs to be in collateral decimals)
    const yesValue = (Number(yesShares) * yes) / 1e18;
    const noValue = (Number(noShares) * no) / 1e18;

    return new Response(
      JSON.stringify({
        success: true,
        market,
        user,
        position: {
          yesShares: yesShares.toString(),
          yesSharesFormatted: formatUnits(yesShares, 18),
          noShares: noShares.toString(),
          noSharesFormatted: formatUnits(noShares, 18),
          yesValue: yesValue.toFixed(decimals),
          noValue: noValue.toFixed(decimals),
          totalValue: (yesValue + noValue).toFixed(decimals),
          hasPosition: yesShares > 0n || noShares > 0n,
        },
        currentPrices: {
          yes,
          no,
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
