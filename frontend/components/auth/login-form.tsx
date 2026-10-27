"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { Mail, Lock, AlertCircle, Shield } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const { signInWithPassword } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    setIsLoading(true);
    try {
      const { error: signInError } = await signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message || "Failed to sign in. Please verify your credentials.");
        return;
      }
      router.push(ROUTES.DASHBOARD);
    } catch {
      setError("An unexpected error occurred during sign in.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickSignIn = async () => {
    setEmail("officeos@gmail.com");
    setPassword("password123");
    setIsLoading(true);
    setError(null);
    try {
      const { error: signInError } = await signInWithPassword({
        email: "officeos@gmail.com",
        password: "password123",
      });
      if (signInError) {
        setError(signInError.message || "Failed to sign in.");
        return;
      }
      router.push(ROUTES.DASHBOARD);
    } catch {
      setError("An unexpected error occurred during sign in.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-lg border-slate-200/80 rounded-2xl">
      <CardHeader className="space-y-2 text-center pb-5 pt-6 px-6">
        <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
          Sign In to OfficeOS
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Enter your organization email and password to access your workspace.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              className="flex items-center space-x-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" required className="text-xs font-semibold text-slate-700">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="user@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail className="h-4 w-4" />}
              required
              autoComplete="email"
              className="h-10 text-sm"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" required className="text-xs font-semibold text-slate-700">
                Password
              </Label>
              <Link
                href={ROUTES.FORGOT_PASSWORD}
                className="text-xs font-medium text-primary-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              required
              autoComplete="current-password"
              className="h-10 text-sm"
            />
          </div>

          <Button type="submit" className="w-full mt-2 min-h-[44px] text-sm font-semibold shadow-sm" isLoading={isLoading}>
            Sign In
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
              <span className="bg-white px-2.5 text-slate-400 font-semibold">Or Quick Demo</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleQuickSignIn}
            disabled={isLoading}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-primary-50 text-primary-700 hover:bg-primary-100 hover:text-primary-800 border-primary-200 text-xs font-semibold shadow-xs"
          >
            <Shield className="h-4 w-4" />
            <span>One-Click Sign In (Admin)</span>
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center text-xs text-slate-500">
        <span>Need access? Contact your organization administrator.</span>
      </CardFooter>
    </Card>
  );
}
