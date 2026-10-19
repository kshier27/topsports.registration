import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 9am Toronto (13:00 UTC): reminders for sessions starting in 3 days.
crons.daily("program-reminders", { hourUTC: 13, minuteUTC: 0 }, internal.reminders.sendProgramReminders);

// Hourly: remind families who started checkout 24h ago but didn't pay.
crons.interval("abandoned-cart-reminders", { hours: 1 }, internal.abandoned.sendAbandonedCartReminders);

// Hourly: alert location inboxes when a session hits 90% / full.
crons.interval("session-fill-alerts", { hours: 1 }, internal.staffAlerts.checkSessionFill);

// Mondays 8am Toronto (12:00 UTC): weekly summary per location.
crons.weekly("weekly-location-summary", { dayOfWeek: "monday", hourUTC: 12, minuteUTC: 0 }, internal.staffAlerts.sendWeeklySummary);

export default crons;
