import { useState } from "react";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { LoginPage } from "@/routes/login";
import { SignupPage } from "@/routes/signup";
import { Button } from "@/components/ui/button";

type AuthRoute = "login" | "signup";

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [authRoute, setAuthRoute] = useState<AuthRoute>("login");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authRoute === "signup") {
      return <SignupPage onNavigateToLogin={() => setAuthRoute("login")} />;
    }
    return <LoginPage onNavigateToSignup={() => setAuthRoute("signup")} />;
  }

  // Authenticated — placeholder until #13 (app shell + routing)
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Botchestra</h1>
      <p className="text-muted-foreground">
        Authenticated. App shell coming in issue #13.
      </p>
      <Button variant="outline" onClick={() => void signOut()}>
        Log out
      </Button>
    </div>
  );
}
