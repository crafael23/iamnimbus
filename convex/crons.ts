import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.daily("expire visitor analytics", { hourUTC: 3 }, internal.analytics.internal.prune, {});
crons.hourly("expire arcade runs", { minuteUTC: 17 }, internal.arcade.internal.cleanupRuns, {});
export default crons;
