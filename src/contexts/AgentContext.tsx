// Agent Context
// Unified state management for AI agents (ERC-8004, Moltbook, x402)

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useERC8004 } from '../hooks/useERC8004';
import { useMoltbookAuth } from '../hooks/useMoltbookAuth';
import { useX402, useX402Endpoints } from '../hooks/useX402';
import type { OnChainAgent, ReputationDetails, AgentMetadata } from '../config/erc8004';

// Moltbook agent type
interface MoltbookAgent {
  id: string;
  moltbook_id: string;
  moltbook_name: string;
  moltbook_karma: number;
  controller_address: string;
  is_new: boolean;
}

// Combined agent identity
interface AgentIdentity {
  // Identification
  type: 'erc8004' | 'moltbook' | 'none';
  isAgent: boolean;

  // ERC-8004 specific
  erc8004TokenId: bigint | null;
  erc8004Agent: OnChainAgent | null;
  reputation: bigint | null;
  reputationDetails: ReputationDetails | null;

  // Moltbook specific
  moltbookAgent: MoltbookAgent | null;
  moltbookKarma: number | null;

  // Combined display info
  displayName: string | null;
  controllerAddress: string | null;
}

interface AgentContextValue {
  // Identity state
  identity: AgentIdentity;
  isLoading: boolean;

  // ERC-8004 actions
  registerERC8004Agent: (name: string, metadata?: Partial<AgentMetadata>) => Promise<bigint | null>;
  isRegisteringERC8004: boolean;
  erc8004Error: string | null;

  // Moltbook actions
  signInWithMoltbook: (identityToken: string) => Promise<boolean>;
  signInWithMoltbookApiKey: (apiKey: string) => Promise<boolean>;
  signOutMoltbook: () => void;
  moltbookError: string | null;

  // x402 payments
  createX402Payment: (amount: string, recipient: string) => Promise<string | null>;
  fetchWithX402Payment: (url: string, amount: string, recipient?: string, options?: RequestInit) => Promise<Response>;
  fetchMarketData: (marketAddress: string) => Promise<unknown>;
  executeAgentTrade: (params: { marketAddress: string; isYes: boolean; amount: string }) => Promise<unknown>;
  isCreatingPayment: boolean;
  x402Error: string | null;
}

const AgentContext = createContext<AgentContextValue | null>(null);

interface AgentProviderProps {
  children: ReactNode;
}

export function AgentProvider({ children }: AgentProviderProps) {
  // ERC-8004 hook
  const {
    agentTokenId,
    agent: erc8004Agent,
    isRegisteredAgent: isERC8004Agent,
    isLoadingAgent: isLoadingERC8004,
    reputation,
    reputationDetails,
    registerAgent: registerERC8004Agent,
    isRegistering: isRegisteringERC8004,
    registrationError: erc8004Error,
  } = useERC8004();

  // Moltbook hook
  const {
    agent: moltbookAgent,
    isAuthenticated: isMoltbookAuthenticated,
    isLoading: isLoadingMoltbook,
    error: moltbookError,
    signInWithToken: signInWithMoltbook,
    signInWithApiKey: signInWithMoltbookApiKey,
    signOut: signOutMoltbook,
  } = useMoltbookAuth();

  // x402 hooks
  const {
    createPayment: createX402Payment,
    fetchWithPayment: fetchWithX402Payment,
    isCreatingPayment,
    paymentError: x402Error,
  } = useX402();

  const {
    fetchMarketData,
    executeAgentTrade,
  } = useX402Endpoints();

  // Build combined identity
  const identity = useMemo((): AgentIdentity => {
    // Prefer ERC-8004 if available, then Moltbook
    if (isERC8004Agent && erc8004Agent) {
      return {
        type: 'erc8004',
        isAgent: true,
        erc8004TokenId: agentTokenId,
        erc8004Agent,
        reputation,
        reputationDetails,
        moltbookAgent: null,
        moltbookKarma: null,
        displayName: erc8004Agent.name,
        controllerAddress: erc8004Agent.owner,
      };
    }

    if (isMoltbookAuthenticated && moltbookAgent) {
      return {
        type: 'moltbook',
        isAgent: true,
        erc8004TokenId: null,
        erc8004Agent: null,
        reputation: null,
        reputationDetails: null,
        moltbookAgent,
        moltbookKarma: moltbookAgent.moltbook_karma,
        displayName: moltbookAgent.moltbook_name,
        controllerAddress: moltbookAgent.controller_address,
      };
    }

    return {
      type: 'none',
      isAgent: false,
      erc8004TokenId: null,
      erc8004Agent: null,
      reputation: null,
      reputationDetails: null,
      moltbookAgent: null,
      moltbookKarma: null,
      displayName: null,
      controllerAddress: null,
    };
  }, [
    isERC8004Agent,
    erc8004Agent,
    agentTokenId,
    reputation,
    reputationDetails,
    isMoltbookAuthenticated,
    moltbookAgent,
  ]);

  const value = useMemo(
    (): AgentContextValue => ({
      // Identity
      identity,
      isLoading: isLoadingERC8004 || isLoadingMoltbook,

      // ERC-8004
      registerERC8004Agent,
      isRegisteringERC8004,
      erc8004Error,

      // Moltbook
      signInWithMoltbook,
      signInWithMoltbookApiKey,
      signOutMoltbook,
      moltbookError,

      // x402
      createX402Payment,
      fetchWithX402Payment,
      fetchMarketData,
      executeAgentTrade,
      isCreatingPayment,
      x402Error,
    }),
    [
      identity,
      isLoadingERC8004,
      isLoadingMoltbook,
      registerERC8004Agent,
      isRegisteringERC8004,
      erc8004Error,
      signInWithMoltbook,
      signInWithMoltbookApiKey,
      signOutMoltbook,
      moltbookError,
      createX402Payment,
      fetchWithX402Payment,
      fetchMarketData,
      executeAgentTrade,
      isCreatingPayment,
      x402Error,
    ]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

// Hook to use agent context
export function useAgent(): AgentContextValue {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}

// Convenience hooks for specific features
export function useAgentIdentity() {
  const { identity, isLoading } = useAgent();
  return { ...identity, isLoading };
}

export function useAgentReputation() {
  const { identity } = useAgent();
  return {
    reputation: identity.reputation,
    reputationDetails: identity.reputationDetails,
    karma: identity.moltbookKarma,
  };
}

export function useAgentPayments() {
  const {
    createX402Payment,
    fetchWithX402Payment,
    fetchMarketData,
    executeAgentTrade,
    isCreatingPayment,
    x402Error,
  } = useAgent();

  return {
    createPayment: createX402Payment,
    fetchWithPayment: fetchWithX402Payment,
    fetchMarketData,
    executeAgentTrade,
    isCreatingPayment,
    error: x402Error,
  };
}

export default AgentContext;
