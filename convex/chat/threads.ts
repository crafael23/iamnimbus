import type { ActionCtx, QueryCtx } from "../_generated/server";

/**
 * Authorize access to a thread. Override with your auth logic.
 * For now allows all access – add user/org checks as needed.
 */
export async function authorizeThreadAccess(
	_ctx: QueryCtx | ActionCtx,
	_threadId: string
): Promise<void> {
	// TODO: Add auth – e.g. verify ctx.auth.getUserIdentity() and thread ownership
}
