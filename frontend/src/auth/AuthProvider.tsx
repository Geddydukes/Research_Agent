import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  tenantId: string | null;
  needsOnboarding: boolean;
  setOnboardingComplete: () => void;
  setActiveTenant: (tenantId: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TENANT_KEY = 'tenant_id';
const ONBOARDING_KEY = 'onboarding_complete';

function parseApiError(body: string): string {
  try {
    const json = JSON.parse(body);
    const msg = json?.error?.message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  } catch {
    // ignore
  }
  return body || 'Request failed';
}

async function ensureTenant(accessToken: string): Promise<string | null> {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/tenants/ensure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: '{}',
  });

  if (!response.ok) {
    const errorText = await response.text();
    const friendly = parseApiError(errorText);
    if (friendly.toLowerCase().includes('api key')) {
      throw new Error('We couldn’t finish setting up your account. Please sign in again.');
    }
    throw new Error(friendly);
  }

  const payload = await response.json();
  return payload?.data?.tenant?.id || null;
}

async function isOnboardingComplete(accessToken: string): Promise<boolean> {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/settings`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return false;
    const json = await res.json();
    const mode = json?.data?.execution_mode;
    return mode === 'hosted' || mode === 'byo_key';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboardingState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const setOnboardingComplete = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setNeedsOnboardingState(false);
  }, []);

  const setActiveTenant = useCallback((nextTenantId: string) => {
    localStorage.setItem(TENANT_KEY, nextTenantId);
    setTenantId(nextTenantId);
  }, []);

  const persistAuth = useCallback(async (nextSession: Session | null) => {
    if (nextSession?.access_token) {
      try {
        const ensuredTenant = await ensureTenant(nextSession.access_token);
        if (ensuredTenant) {
          localStorage.setItem(TENANT_KEY, ensuredTenant);
          setTenantId(ensuredTenant);
          if (!localStorage.getItem(ONBOARDING_KEY)) {
            const alreadyComplete = await isOnboardingComplete(nextSession.access_token);
            if (alreadyComplete) {
              localStorage.setItem(ONBOARDING_KEY, '1');
              setNeedsOnboardingState(false);
            } else {
              setNeedsOnboardingState(true);
            }
          }
        }
      } catch (error) {
        throw error;
      }
    } else {
      localStorage.removeItem(TENANT_KEY);
      setTenantId(null);
      setNeedsOnboardingState(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      if (data.session?.access_token) {
        const storedTenant = localStorage.getItem(TENANT_KEY);
        if (storedTenant) {
          setTenantId(storedTenant);
        } else {
          try {
            const ensured = await ensureTenant(data.session.access_token);
            if (isMounted && ensured) {
              localStorage.setItem(TENANT_KEY, ensured);
              setTenantId(ensured);
              if (!localStorage.getItem(ONBOARDING_KEY)) {
                const alreadyComplete = await isOnboardingComplete(data.session.access_token);
                if (isMounted && alreadyComplete) {
                  localStorage.setItem(ONBOARDING_KEY, '1');
                  setNeedsOnboardingState(false);
                } else if (isMounted) {
                  setNeedsOnboardingState(true);
                }
              }
            }
          } catch {
            if (isMounted) setTenantId(null);
          }
        }
      }
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      try {
        await persistAuth(nextSession);
      } catch {
        setTenantId(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [persistAuth]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      tenantId,
      needsOnboarding,
      setOnboardingComplete,
      setActiveTenant,
      signIn,
      signUp,
      signOut,
    }),
    [session, isLoading, tenantId, needsOnboarding, setOnboardingComplete, setActiveTenant, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
