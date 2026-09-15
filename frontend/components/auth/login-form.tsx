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
import { Mail, Lock, AlertCircle } from "lucide-react";

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

  return (
    <Card className="w-full max-w-md shadow-lg border-slate-200">
      <CardHeader className="space-y-2 text-center pb-6">
        <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
          Sign In to OfficeOS
        </CardTitle>
        <CardDescription>
          Enter your organization email and password to access your workspace.
        </CardDescription>
      </CardHeader>

      <CardContent>
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
            <Label htmlFor="email" required>
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
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" required>
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
            />
          </div>

          <Button type="submit" className="w-full mt-2" isLoading={isLoading}>
            Sign In
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center text-xs text-slate-500">
        <span>Need access? Contact your organization administrator.</span>
      </CardFooter>
    </Card>
  );
}
