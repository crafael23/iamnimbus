"use client";

import { ReactNode, useCallback, useState } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithAuth } from "convex/react";
import { AuthKitProvider, useAuth, useAccessToken } from "@workos-inc/authkit-nextjs/components";

/**
 * Convex calls this hook itself, inside its provider. It is handed over on an
 * object so the component never refers to a hook as a plain value.
 */
const authKit = { useAuth: useAuthFromAuthKit };

export function ConvexClientProvider({ children }: { children: ReactNode }) {
	const [convex] = useState(() => {
		return new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
	});
	return (
		<AuthKitProvider>
			<ConvexProviderWithAuth client={convex} {...authKit}>
				{children}
			</ConvexProviderWithAuth>
		</AuthKitProvider>
	);
}

function useAuthFromAuthKit() {
	const { user, loading: isLoading } = useAuth();
	const { getAccessToken, refresh } = useAccessToken();

	const isAuthenticated = !!user;

	const fetchAccessToken = useCallback(
		async ({ forceRefreshToken }: { forceRefreshToken?: boolean } = {}): Promise<string | null> => {
			if (!user) {
				return null;
			}

			let token: string | null | undefined;
			try {
				if (forceRefreshToken) token = await refresh();
				else token = await getAccessToken();
			} catch (error) {
				console.error("Failed to get access token:", error);
				return null;
			}
			return token ?? null;
		},
		[user, refresh, getAccessToken],
	);

	return {
		isLoading,
		isAuthenticated,
		fetchAccessToken,
	};
}
