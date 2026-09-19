// Personal settings used in the analysis. Edit and redeploy.
export const MAX_HR = 195; // bpm, used for "% of HRmax"
export const SWIM_STROKE_TARGET_CM: [number, number] = [80, 90];

// ---------- Coach ("Today" page) settings. Edit and redeploy. ----------
export const COACH = {
  // Sleep thresholds (hours). Below "ok" for a 3-night average = watch; below "low" = red flag.
  sleepOkH: 7,
  sleepLowH: 6,
  // Used for load estimates when no recent resting HR is available.
  restHrFallback: 55,
  // Days you commute by bike (Mon=1 ... Sun=7). Short 5-18 km rides on these days are treated as commutes:
  // they count toward load but are never counted as "hard" sessions.
  commuteDays: [1, 2, 3, 4],
  // Injury guardrails for running. Set active:false when you're cleared to train normally.
  rehab: {
    active: true,
    minGapDays: 2, // at least one full day between run / impact days
    maxRunMin: 30, // longest single run the page will suggest
    weeklyFloorMin: 60, // run minutes per rolling 7 days always allowed before the growth cap bites
    weeklyGrowth: 0.1, // weekly run time may grow at most 10% over your recent best week
  },
  // Sports that load the same joints as running (treated like a run day for the rest-gap rule).
  impactTypes: [
    "hiking", "tennis_v2", "tennis", "paddelball", "padel", "pickleball",
    "resort_skiing", "resort_snowboarding", "bouldering", "trail_running",
  ],
};

// Password gate. false = anyone with the site address can open it (no login screen).
// Set to true to bring the password back (needs DASHBOARD_PASSWORD and AUTH_SECRET in Vercel).
export const REQUIRE_LOGIN = false;
