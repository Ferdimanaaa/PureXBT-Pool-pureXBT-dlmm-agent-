const path = require("path");

module.exports = {
  apps: [
    {
      name: "pureXBT",
      script: "index.js",
      cwd: __dirname,
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 10000,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--dns-result-order=ipv4first",
        LLM_MODEL: "cc/claude-sonnet-5",
        WALLET_ID: "YOUR_WALLET_PUBLIC_ADDRESS", // opsional: pilih blok config per-wallet di user-config.json
        AGENT_NO_DASHBOARD: "1",
      },
    },
    {
      name: "pureXBT-dash",
      script: "index.js",
      cwd: __dirname,
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 10000,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--dns-result-order=ipv4first",
        LLM_MODEL: "cc/claude-sonnet-5",
        WALLET_ID: "YOUR_WALLET_PUBLIC_ADDRESS", // opsional: pilih blok config per-wallet di user-config.json
        DASHBOARD_ONLY: "1",
      },
    },
    {
      name: "discord-listener",
      script: "index.js",
      cwd: path.join(__dirname, "discord-listener"),
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 10000,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--dns-result-order=ipv4first",
      },
    },
  ],
};
