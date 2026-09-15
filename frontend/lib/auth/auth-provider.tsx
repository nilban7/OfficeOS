"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  AuthState,
  AuthUser,
  AuthSession,
  SignInCredentials,
  ResetPasswordCredentials,
  UpdatePasswordCredentials,
} from "@/types/auth";

interface AuthContextValue extends AuthState {
  signInWithPassword: (credentials: SignInCredentials) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
  resetPasswordForEmail: (credentials: ResetPasswordCredentials) => Promise<{ error: Error | null }>;
  updateUserPassword: (credentials: UpdatePasswordCredentials) => Promise<{ error: Error | null }>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function mapSupabaseUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || "",
    fullName: (user.user_metadata?.["full_name"] as string) || (user.user_metadata?.["name"] as string) || undefined,
    avatarUrl: (user.user_metadata?.["avatar_url"] as string) || undefined,
    createdAt: user.created_at,
  };
}

function mapSupabaseSession(session: Session | null): AuthSession | null {
  if (!session || !session.user) return null;
  const user = mapSupabaseUser(session.user);
  if (!user) return null;

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    user,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("Error retrieving Supabase session:", error.message);
        }
        if (isMounted) {
          const initialSession = mapSupabaseSession(data?.session ?? null);
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
        }
      } catch (err) {
        console.warn("Supabase auth initialization skipped:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (isMounted) {
        const mapped = mapSupabaseSession(currentSession);
        setSession(mapped);
        setUser(mapped?.user ?? null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithPassword = async ({ email, password }: SignInCredentials) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: new Error(error.message) };
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Failed to sign in") };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) return { error: new Error(error.message) };
      setSession(null);
      setUser(null);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Failed to sign out") };
    }
  };

  const resetPasswordForEmail = async ({ email }: ResetPasswordCredentials) => {
    try {
      const redirectUrl = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      if (error) return { error: new Error(error.message) };
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Failed to send reset link") };
    }
  };

  const updateUserPassword = async ({ password }: UpdatePasswordCredentials) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { error: new Error(error.message) };
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Failed to update password") };
    }
  };

  const refreshSession = async () => {
    try {
      const { data } = await supabase.auth.refreshSession();
      const mapped = mapSupabaseSession(data?.session ?? null);
      setSession(mapped);
      setUser(mapped?.user ?? null);
    } catch (err) {
      console.warn("Failed to refresh session:", err);
    }
  };

  const isAuthenticated = Boolean(user && session?.accessToken);
  const status = isLoading ? "loading" : isAuthenticated ? "authenticated" : "unauthenticated";

  const contextValue: AuthContextValue = {
    user,
    session,
    status,
    isLoading,
    isAuthenticated,
    signInWithPassword,
    signOut,
    resetPasswordForEmail,
    updateUserPassword,
    refreshSession,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
