// Moltbook Authentication Hook
// Handles agent sign-in via Moltbook identity tokens

import { useState, useCallback, useEffect } from 'react';
import { setAuthToken, restoreAuthToken, callEdgeFunction } from '../lib/supabase';

// Moltbook API endpoints
const MOLTBOOK_TOKEN_URL = 'https://moltbook.com/api/v1/agents/me/identity-token';

interface MoltbookAgent {
  id: string;
  moltbook_id: string;
  moltbook_name: string;
  moltbook_karma: number;
  controller_address: string;
  is_new: boolean;
}

interface MoltbookAuthResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
  agent: MoltbookAgent;
}

interface UseMoltbookAuthReturn {
  // State
  agent: MoltbookAgent | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  signInWithToken: (identityToken: string) => Promise<boolean>;
  signInWithApiKey: (apiKey: string) => Promise<boolean>;
  signOut: () => void;
}

export function useMoltbookAuth(): UseMoltbookAuthReturn {
  const [agent, setAgent] = useState<MoltbookAgent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    const storedAgent = localStorage.getItem('moltbook-agent');
    const token = restoreAuthToken();

    if (storedAgent && token) {
      try {
        setAgent(JSON.parse(storedAgent));
      } catch {
        localStorage.removeItem('moltbook-agent');
      }
    }
  }, []);

  // Sign in with a pre-fetched identity token
  const signInWithToken = useCallback(async (identityToken: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: apiError } = await callEdgeFunction<MoltbookAuthResult>('authMoltbook', {
        identity_token: identityToken,
        audience: 'prediction-market-rbs',
      });

      if (apiError || !data) {
        setError(apiError || 'Failed to authenticate with Moltbook');
        return false;
      }

      // Store auth token
      setAuthToken(data.access_token);

      // Store agent data
      setAgent(data.agent);
      localStorage.setItem('moltbook-agent', JSON.stringify(data.agent));

      console.log(`Moltbook agent authenticated: ${data.agent.moltbook_name}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Moltbook auth error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sign in using Moltbook API key (fetches identity token first)
  const signInWithApiKey = useCallback(async (apiKey: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // First, get identity token from Moltbook
      const tokenResponse = await fetch(MOLTBOOK_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audience: 'prediction-market-rbs',
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        setError(`Failed to get identity token: ${errorText}`);
        return false;
      }

      const { identity_token } = await tokenResponse.json();

      // Now sign in with the identity token
      return await signInWithToken(identity_token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Moltbook API key auth error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [signInWithToken]);

  // Sign out
  const signOut = useCallback(() => {
    setAuthToken(null);
    setAgent(null);
    localStorage.removeItem('moltbook-agent');
    console.log('Moltbook agent signed out');
  }, []);

  return {
    agent,
    isAuthenticated: !!agent,
    isLoading,
    error,
    signInWithToken,
    signInWithApiKey,
    signOut,
  };
}

/**
 * Utility to check if the current session is a Moltbook agent
 */
export function isMoltbookAgent(): boolean {
  return !!localStorage.getItem('moltbook-agent');
}

/**
 * Get stored Moltbook agent without hook
 */
export function getStoredMoltbookAgent(): MoltbookAgent | null {
  const stored = localStorage.getItem('moltbook-agent');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export default useMoltbookAuth;
