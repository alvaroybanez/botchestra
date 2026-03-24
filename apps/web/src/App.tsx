import { useEffect, useMemo } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { router } from "@/router";

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  const auth = useMemo(
    () => ({
      isAuthenticated,
      isLoading,
    }),
    [isAuthenticated, isLoading],
  );

  useEffect(() => {
    void router.invalidate();
  }, [isAuthenticated, isLoading]);

  return <RouterProvider context={{ auth }} router={router} />;
}
