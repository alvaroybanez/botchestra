import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
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

export function SignupPage({
  onNavigateToLogin,
}: {
  onNavigateToLogin: () => void;
}) {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            Enter your details to get started with Botchestra
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="signup-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);

              const formData = new FormData(e.currentTarget);
              const password = formData.get("password") as string;
              const confirm = formData.get("confirmPassword") as string;

              if (password !== confirm) {
                setError("Passwords do not match");
                return;
              }

              setLoading(true);
              formData.set("flow", "signUp");
              formData.delete("confirmPassword");
              void signIn("password", formData)
                .catch(() => setError("Could not create account"))
                .finally(() => setLoading(false));
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="signup-confirm">Confirm Password</Label>
              <Input
                id="signup-confirm"
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button
            type="submit"
            form="signup-form"
            className="w-full"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Sign up"}
          </Button>
          <Button
            variant="link"
            type="button"
            onClick={onNavigateToLogin}
          >
            Already have an account? Log in
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
