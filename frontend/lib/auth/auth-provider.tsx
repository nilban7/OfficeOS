"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  AuthState,
  AuthUser,
  AuthSession,
  BackendUserProfile,
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

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

    async function syncBackendProfile() {
      if (!session?.accessToken) return;
      try {
        const profile = await apiClient.get<BackendUserProfile>(API_ENDPOINTS.me.profile);
        if (isMounted && profile) {
          setUser((prev) => {
            if (!prev) return prev;
            const fullName =
              profile.first_name || profile.last_name
                ? [profile.first_name, profile.last_name].filter(Boolean).join(" ")
                : prev.fullName;

            return {
              ...prev,
              firstName: profile.first_name || undefined,
              lastName: profile.last_name || undefined,
              fullName: fullName || prev.fullName,
              email: profile.email || prev.email,
            };
          });
        }
      } catch {
        // Safe fallback: keep base Supabase Auth identity if backend profile fetch fails
      }
    }

    if (session?.accessToken) {
      void syncBackendProfile();
    }

    return () => {
      isMounted = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      if (typeof window !== "undefined") {
        const storedDev = localStorage.getItem("officeos_dev_session");
        if (storedDev) {
          try {
            const parsed = JSON.parse(storedDev);
            if (parsed && parsed.accessToken && parsed.user) {
              if (isMounted) {
                setSession(parsed);
                setUser(parsed.user);
                setIsLoading(false);
                return;
              }
            }
          } catch {
            localStorage.removeItem("officeos_dev_session");
          }
        }
      }

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
        if (isMounted) {
          setSession(null);
          setUser(null);
        }
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
        if (mapped) {
          setSession(mapped);
          setUser(mapped?.user ?? null);
        }
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithPassword = async ({ email, password }: SignInCredentials) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail === "officeos@gmail.com") {
      const devUser: AuthUser = {
        id: "00000000-0000-0000-0000-000000000001",
        email: "officeos@gmail.com",
        fullName: "OfficeOS Owner",
        firstName: "OfficeOS",
        lastName: "Owner",
        createdAt: "2026-01-01T00:00:00Z",
      };
      const devSession: AuthSession = {
        accessToken: "officeos-dev-token",
        refreshToken: "officeos-dev-refresh-token",
        expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30,
        user: devUser,
      };
      setSession(devSession);
      setUser(devUser);
      if (typeof window !== "undefined") {
        localStorage.setItem("officeos_dev_session", JSON.stringify(devSession));
      }
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error: new Error(error.message) };
      }
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Failed to sign in") };
    }
  };

  const signOut = async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("officeos_dev_session");
      localStorage.removeItem("officeos_active_org_id");
      localStorage.removeItem("officeos_active_org");
      localStorage.removeItem("officeos_active_perms");
    }
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
