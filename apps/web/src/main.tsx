import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import App from "@/App";
import "@/index.css";

export const APP_NAME = "Botchestra" as const;

const root = document.getElementById("root");
if (root) {
  const convexUrl = (
    import.meta.env.VITE_CONVEX_URL ?? import.meta.env.CONVEX_URL
  ) as string;
  const convex = new ConvexReactClient(convexUrl);

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ConvexAuthProvider client={convex}>
        <App />
      </ConvexAuthProvider>
    </React.StrictMode>,
  );
}
