// Edge Function: x402-deploy-market
// Deploy a new prediction market via factory contract (0.0001 USDC)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { encodeFunctionData } from "https://esm.sh/viem@2.0.0";
import { corsHeaders, handlePayment, X402_CONFIG } from "../_shared/x402.ts";

// MarketFactory address on Monad Testnet
const MARKET_FACTORY = "0xc486fD94Af1b18CE2d246cBD0941d06F06d4d159";

// USDC address
const USDC_ADDRESS = "0x534b2f3A21130d7a60830c2Df862319e593943A3";

// Factory ABI
const FACTORY_ABI = [
  {
    name: "createMarket",
    type: "function",
    inputs: [
      { name: "question", type: "string" },
      { name: "resolutionTime", type: "uint256" },
      { name: "oracle", type: "address" },
      { name: "yesSymbol", type: "string" },
      { name: "noSymbol", type: "string" },
    ],
    outputs: [{ name: "market", type: "address" }],
    stateMutability: "nonpayable",
  },
] as const;

// ERC20 ABI for approval
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

interface DeployRequest {
  question: string;
  resolutionTime: number; // Unix timestamp
  oracle?: string; // Defaults to caller
  yesSymbol?: string;
  noSymbol?: string;
  initialLiquidity: string; // USDC amount (e.g., "2.5")
  callerAddress: string;
  category?: string;
  tags?: string[];
}

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
    const body = await req.json() as DeployRequest;

    // Validate required fields
    if (!body.question || !body.resolutionTime || !body.initialLiquidity || !body.callerAddress) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          required: ["question", "resolutionTime", "initialLiquidity", "callerAddress"],
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate resolution time is in the future
    const now = Math.floor(Date.now() / 1000);
    if (body.resolutionTime <= now) {
      return new Response(
        JSON.stringify({ error: "Resolution time must be in the future" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle x402 payment
    const paymentResult = await handlePayment(req, "x402-deploy-market", {
      question: body.question,
      resolutionTime: body.resolutionTime,
      initialLiquidity: body.initialLiquidity,
    });
    if (!paymentResult.success) {
      return paymentResult.response;
    }

    // Check if factory is deployed
    if (MARKET_FACTORY === "0x0000000000000000000000000000000000000000") {
      return new Response(
        JSON.stringify({
          error: "MarketFactory not yet deployed",
          note: "Factory contract needs to be deployed first. Contact admin.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate symbols from question
    const shortQuestion = body.question.slice(0, 10).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const yesSymbol = body.yesSymbol || `YES-${shortQuestion}`;
    const noSymbol = body.noSymbol || `NO-${shortQuestion}`;

    // Oracle defaults to caller
    const oracle = body.oracle || body.callerAddress;

    // Encode factory call
    const createMarketData = encodeFunctionData({
      abi: FACTORY_ABI,
      functionName: "createMarket",
      args: [
        body.question,
        BigInt(body.resolutionTime),
        oracle as `0x${string}`,
        yesSymbol,
        noSymbol,
      ],
    });

    // Parse initial liquidity (USDC has 6 decimals)
    const liquidityAmount = BigInt(Math.floor(parseFloat(body.initialLiquidity) * 1e6));

    // Encode USDC approval for factory (for initialization later)
    // Note: Approval is for a placeholder - actual market address comes from factory
    const approvalData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [MARKET_FACTORY as `0x${string}`, liquidityAmount * 2n], // 2x for safety margin
    });

    // Build transaction sequence
    const transactions = [
      {
        to: MARKET_FACTORY,
        data: createMarketData,
        type: "createMarket",
        description: `Deploy market: "${body.question.slice(0, 50)}..."`,
        note: "This deploys the market contract. Save the returned market address from the event.",
      },
    ];

    // Store in database for tracking
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from("market_deploy_requests").insert({
        question: body.question,
        resolution_time: new Date(body.resolutionTime * 1000).toISOString(),
        oracle,
        creator_address: body.callerAddress.toLowerCase(),
        initial_liquidity: body.initialLiquidity,
        category: body.category,
        tags: body.tags,
        status: "pending",
      });
    } catch (dbErr) {
      console.log("DB logging skipped:", dbErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        factory: MARKET_FACTORY,
        transactions,
        params: {
          question: body.question,
          resolutionTime: body.resolutionTime,
          resolutionDate: new Date(body.resolutionTime * 1000).toISOString(),
          oracle,
          yesSymbol,
          noSymbol,
          initialLiquidity: body.initialLiquidity,
        },
        nextSteps: [
          "1. Execute the createMarket transaction",
          "2. Get the new market address from MarketCreated event",
          "3. Approve USDC for the new market address",
          "4. Call initialize(amount) on the new market",
          "5. Call listMarket() in SDK to add to discovery index",
        ],
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
