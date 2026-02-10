// Supabase Client Configuration
import { createClient } from '@supabase/supabase-js';

// Environment variables (with type declaration for Vite)
declare global {
  interface ImportMeta {
    readonly env: Record<string, string | undefined>;
  }
}

// Remove ALL whitespace (including newlines that may have been copy-pasted)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\s/g, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.replace(/\s/g, '');

// Debug logging for Supabase config
console.log('Supabase URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'NOT SET');
console.log('Supabase Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'NOT SET');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

// Create Supabase client (using any type for flexibility until schema is deployed)
export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // We use SIWE, not OAuth
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

// Helper to set auth token from SIWE auth
export function setAuthToken(token: string | null): void {
  if (token) {
    supabase.functions.setAuth(token);
    // Store in localStorage for persistence
    localStorage.setItem('supabase-auth-token', token);
  } else {
    localStorage.removeItem('supabase-auth-token');
  }
}

// Restore auth token on load
export function restoreAuthToken(): string | null {
  const token = localStorage.getItem('supabase-auth-token');
  if (token) {
    supabase.functions.setAuth(token);
  }
  return token;
}

// Edge function URLs
export const EDGE_FUNCTIONS = {
  // Human wallet auth (SIWE)
  authNonce: '/functions/v1/auth-nonce',
  authVerify: '/functions/v1/auth-verify',
  // Agent auth (Moltbook)
  authMoltbook: '/functions/v1/auth-moltbook',
  // x402 protected endpoints
  x402MarketData: '/functions/v1/x402-market-data',
  x402AgentTrade: '/functions/v1/x402-agent-trade',
  // Indexer
  indexer: '/functions/v1/indexer',
};

// Helper to call edge functions
export async function callEdgeFunction<T = unknown>(
  functionName: keyof typeof EDGE_FUNCTIONS,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(`${supabaseUrl}${EDGE_FUNCTIONS[functionName]}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey || '',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: data.error || 'Request failed' };
    }

    return { data: data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export default supabase;
