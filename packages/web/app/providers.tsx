"use client";

import { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </SessionProvider>
  );
}
