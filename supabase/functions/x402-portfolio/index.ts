// Edge Function: x402-portfolio
// Get full portfolio with all positions and P&L for a user - x402 protected (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createPublicClient, http, formatUnits } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

const LSLMSR_ABI = [
  { name: "yesToken", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "noToken", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { name: "getYesPrice", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getNoPrice", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "resolved", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { name: "yesWins", type: "function", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
] as const;

const ERC20_ABI = [
  { name: "balanceOf", type: "function", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

interface PortfolioPosition {
  marketAddress: string;
  marketQuestion: string;
  yesShares: string;
  noShares: string;
  yesSharesFormatted: string;
  noSharesFormatted: string;
  currentYesPrice: number;
  currentNoPrice: number;
  yesValue: string;
  noValue: string;
  totalValue: string;
  resolved: boolean;
  yesWins: boolean;
  hasPosition: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const user = url.searchParams.get("user");

    if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) {
      return new Response(
        JSON.stringify({ error: "Valid user address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle x402 payment (verify, settle, and log)
    const paymentResult = await handlePayment(req, "x402-portfolio", { user });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active markets from database
    const { data: markets, error: marketsError } = await supabase
      .from("markets")
      .select("id, address, question, resolved, yes_wins")
      .eq("status", "ACTIVE");

    if (marketsError) throw marketsError;

    if (!markets || markets.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          user,
          positions: [],
          summary: {
            totalPositions: 0,
            totalValue: "0",
            marketsWithPositions: 0,
          },
          payment: {
            amount: X402_CONFIG.price,
            amountFormatted: X402_CONFIG.priceFormatted,
            payer: paymentResult.payerAddress,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const userAddress = user as `0x${string}`;
    const positions: PortfolioPosition[] = [];

    // Check each market for positions
    for (const market of markets) {
      try {
        const marketAddress = market.address as `0x${string}`;

        // Get token addresses and prices
        const [yesToken, noToken, yesPrice, noPrice, resolved, yesWins] = await Promise.all([
          client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "yesToken" }),
          client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "noToken" }),
          client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "getYesPrice" }),
          client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "getNoPrice" }),
          client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "resolved" }),
          client.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: "yesWins" }),
        ]);

        // Get user balances
        const [yesShares, noShares] = await Promise.all([
          client.readContract({ address: yesToken as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [userAddress] }),
          client.readContract({ address: noToken as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [userAddress] }),
        ]);

        const hasPosition = yesShares > 0n || noShares > 0n;

        // Only include markets where user has a position
        if (hasPosition) {
          const yes = Number(yesPrice) / 1e18;
          const no = Number(noPrice) / 1e18;

          // Calculate values (shares are 1e18, prices are 1e18)
          const yesValue = (Number(yesShares) * yes) / 1e18;
          const noValue = (Number(noShares) * no) / 1e18;

          positions.push({
            marketAddress: market.address,
            marketQuestion: market.question,
            yesShares: yesShares.toString(),
            noShares: noShares.toString(),
            yesSharesFormatted: formatUnits(yesShares, 18),
            noSharesFormatted: formatUnits(noShares, 18),
            currentYesPrice: yes,
            currentNoPrice: no,
            yesValue: yesValue.toFixed(6),
            noValue: noValue.toFixed(6),
            totalValue: (yesValue + noValue).toFixed(6),
            resolved: resolved as boolean,
            yesWins: yesWins as boolean,
            hasPosition: true,
          });
        }
      } catch (err) {
        console.warn(`Failed to check market ${market.address}:`, err);
        // Continue with other markets
      }
    }

    // Calculate summary
    const totalValue = positions.reduce((sum, p) => sum + parseFloat(p.totalValue), 0);

    return new Response(
      JSON.stringify({
        success: true,
        user,
        positions,
        summary: {
          totalPositions: positions.length,
          totalValue: totalValue.toFixed(6),
          marketsWithPositions: positions.length,
          totalMarketsChecked: markets.length,
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
