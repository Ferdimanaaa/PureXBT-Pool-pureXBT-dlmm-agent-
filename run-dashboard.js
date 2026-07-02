// Standalone dashboard server — runs persistently until Ctrl+C
// Usage: DASHBOARD_PORT=3001 node run-dashboard.js

// MUST set port BEFORE importing dashboard.js — its module-level PORT constant
// is evaluated at import time (ES modules), not when startDashboard() runs.
process.env.DASHBOARD_PORT = "3001";

const { startDashboard } = await import("./dashboard.js");

console.log("PureXBT Pool Dashboard (Standalone)");
console.log("Open: http://127.0.0.1:3001");
console.log("Press Ctrl+C to stop");
startDashboard();
