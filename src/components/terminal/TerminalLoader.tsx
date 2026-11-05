"use client";

import dynamic from "next/dynamic";

// Client-only: the terminal reads browser storage on first render (guest id,
// boot-once flag), so rendering it on the server would only cause a mismatch.
const Terminal = dynamic(
	() => import("./Terminal").then((m) => m.Terminal),
	{ ssr: false, loading: () => <div className="min-h-[100dvh] bg-void" /> },
);

export function TerminalLoader() {
	return <Terminal />;
}
