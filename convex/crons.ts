import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";
import { HEARTBEAT_MONITOR_INTERVAL_SECONDS } from "./heartbeatMonitor";

const crons = cronJobs();

crons.interval(
  "monitor stale run heartbeats",
  { seconds: HEARTBEAT_MONITOR_INTERVAL_SECONDS },
  internal.heartbeatMonitor.monitorStaleRuns,
  {},
);

export default crons;
