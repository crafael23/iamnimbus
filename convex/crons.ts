import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.daily(
	"expire visitor analytics",
	{ hourUTC: 3, minuteUTC: 0 },
	internal.analytics.internal.prune,
	{},
);
export default crons;
