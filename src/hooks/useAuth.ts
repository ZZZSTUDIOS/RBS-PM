// SIWE Authentication Hook
import { useState, useCallback, useEffect } from 'react';
import { useAccount, useSignMessage, useChainId } from 'wagmi';
import { SiweMessage } from 'siwe';
import { supabase, callEdgeFunction, setAuthToken, restoreAuthToken } from '../lib/supabase';
import type { User } from '../types/supabase';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface NonceResponse {
  nonce: string;
  issued_at: string;
  expiration_time: string;
  is_new_user: boolean;
}

interface VerifyResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
  user: User;
}

export function useAuth() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      const token = restoreAuthToken();
      if (!token) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        // Verify token is still valid by fetching user
        const storedUser = localStorage.getItem('supabase-user');
        if (storedUser) {
          const user = JSON.parse(storedUser) as User;
          // Check if wallet still matches
          if (address && user.wallet_address.toLowerCase() === address.toLowerCase()) {
            setAuthState({
              user,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
            return;
          }
        }
      } catch (err) {
        console.error('Session check failed:', err);
      }

      // Clear invalid session
      setAuthToken(null);
      localStorage.removeItem('supabase-user');
      setAuthState(prev => ({ ...prev, isLoading: false }));
    };

    checkSession();
  }, [address]);

  // Sign in with SIWE
  const signIn = useCallback(async (): Promise<boolean> => {
    if (!address || !isConnected) {
      setAuthState(prev => ({ ...prev, error: 'Wallet not connected' }));
      return false;
    }

    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Step 1: Get nonce from server
      const { data: nonceData, error: nonceError } = await callEdgeFunction<NonceResponse>(
        'authNonce',
        { wallet_address: address }
      );

      if (nonceError || !nonceData) {
        throw new Error(nonceError || 'Failed to get nonce');
      }

      // Step 2: Create SIWE message
      const domain = window.location.host;
      const origin = window.location.origin;
      const statement = 'Sign in to Prediction Market';

      const siweMessage = new SiweMessage({
        domain,
        address,
        statement,
        uri: origin,
        version: '1',
        chainId,
        nonce: nonceData.nonce,
        issuedAt: nonceData.issued_at,
        expirationTime: nonceData.expiration_time,
      });

      const message = siweMessage.prepareMessage();

      // Step 3: Sign message
      const signature = await signMessageAsync({ message });

      // Step 4: Verify signature on server
      const { data: verifyData, error: verifyError } = await callEdgeFunction<VerifyResponse>(
        'authVerify',
        { message, signature }
      );

      if (verifyError || !verifyData) {
        throw new Error(verifyError || 'Verification failed');
      }

      // Step 5: Store token and user
      setAuthToken(verifyData.access_token);
      localStorage.setItem('supabase-user', JSON.stringify(verifyData.user));

      setAuthState({
        user: verifyData.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sign in failed';
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return false;
    }
  }, [address, isConnected, chainId, signMessageAsync]);

  // Sign out
  const signOut = useCallback(async () => {
    setAuthToken(null);
    localStorage.removeItem('supabase-user');

    // Clear session from database if we have one
    try {
      await supabase.from('auth_sessions').delete().neq('id', '');
    } catch (err) {
      console.error('Failed to clear sessions:', err);
    }

    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  }, []);

  // Update profile
  const updateProfile = useCallback(
    async (updates: { display_name?: string; avatar_url?: string }): Promise<boolean> => {
      if (!authState.user) return false;

      try {
        const { error } = await supabase
          .from('users')
          .update(updates as Record<string, unknown>)
          .eq('id', authState.user.id);

        if (error) throw error;

        const updatedUser = { ...authState.user, ...updates };
        localStorage.setItem('supabase-user', JSON.stringify(updatedUser));
        setAuthState(prev => ({ ...prev, user: updatedUser as User }));

        return true;
      } catch (err) {
        console.error('Profile update failed:', err);
        return false;
      }
    },
    [authState.user]
  );

  // Refresh user data from database
  const refreshUser = useCallback(async () => {
    if (!authState.user) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authState.user.id)
        .single();

      if (error) throw error;

      localStorage.setItem('supabase-user', JSON.stringify(data));
      setAuthState(prev => ({ ...prev, user: data }));
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  }, [authState.user]);

  return {
    ...authState,
    signIn,
    signOut,
    updateProfile,
    refreshUser,
  };
}

export default useAuth;
