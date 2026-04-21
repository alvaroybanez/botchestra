/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly CONVEX_URL?: string;
  readonly VITE_CONVEX_URL?: string;
}

declare module "cssstudio" {
  export function startStudio(): void;
}
