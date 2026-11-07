import { internalQuery } from "../_generated/server";
import { requireAdmin } from "../_lib/auth";

/** Throws unless the caller is an admin. Used by `adminAction`. */
export const requireAdminUser = internalQuery({
	args: {},
	handler: async (ctx) => await requireAdmin(ctx),
});
