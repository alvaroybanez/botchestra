import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Link, useRouter } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginPage({
  redirectPath,
}: {
  redirectPath: string;
}) {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void router.invalidate().then(() => {
      router.history.push(redirectPath);
    });
  }, [isAuthenticated, redirectPath, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in to Botchestra</CardTitle>
          <CardDescription>
            Enter your email and password to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="login-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              setLoading(true);
              const formData = new FormData(e.currentTarget);
              formData.set("flow", "signIn");
              void signIn("password", formData)
                .catch(() => setError("Invalid email or password"))
                .finally(() => setLoading(false));
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button
            type="submit"
            form="login-form"
            className="w-full"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Log in"}
          </Button>
          <Link
            className="text-sm text-primary underline-offset-4 hover:underline"
            search={{ redirect: redirectPath }}
            to="/signup"
          >
            Don't have an account? Sign up
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
