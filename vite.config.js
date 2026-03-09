import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

function stooqProxyPlugin() {
  return {
    name: "stooq-proxy-plugin",
    configureServer(server) {
      server.middlewares.use("/api/stooq", async (req, res) => {
        try {
          const url = new URL(req.url, "http://localhost");
          const symbol = url.searchParams.get("symbol");

          if (!symbol) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "symbol query param is required" }));
            return;
          }

          const upstream = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&i=5`);
          const text = (await upstream.text()).trim();
          const parts = text.split(",");

          if (!parts.length || (parts[1] ?? "N/D") === "N/D") {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "symbol not available", symbol }));
            return;
          }

          const payload = {
            symbol: parts[0],
            date: parts[1] ?? "",
            time: parts[2] ?? "",
            open: parts[3] ?? "",
            high: parts[4] ?? "",
            low: parts[5] ?? "",
            close: parts[6] ?? "",
            volume: parts[7] ?? "",
          };

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "failed_to_fetch_market_data", detail: String(error) }));
        }
      });
    },
  };
}

export default defineConfig({
  logLevel: "error",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    react(),
    stooqProxyPlugin(),
  ],
});