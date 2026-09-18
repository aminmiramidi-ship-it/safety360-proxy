import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import {
  createProxyMiddleware,
  fixRequestBody,
} from "http-proxy-middleware";

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const NODE_ENV = (process.env.NODE_ENV || "development").toLowerCase();
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const PROXY_TIMEOUT_MS = Number.parseInt(
  process.env.PROXY_TIMEOUT_MS || "15000",
  10,
);

if (NODE_ENV === "production" && !process.env.BACKEND_URL) {
  throw new Error("BACKEND_URL must be configured in production.");
}

const defaultDevelopmentOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5174",
  "http://localhost:5174",
];

const configuredOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set(
  configuredOrigins.length > 0
    ? configuredOrigins
    : NODE_ENV === "production"
      ? []
      : defaultDevelopmentOrigins,
);

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by Safety360 CORS policy."));
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept", "X-Request-ID"],
    maxAge: 600,
  }),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number.parseInt(process.env.RATE_LIMIT_MAX || "300", 10),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      detail: "Zu viele Anfragen. Bitte später erneut versuchen.",
    },
  }),
);

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "2mb" }));

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "Safety360 Proxy",
    version: "1.1.0",
  });
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

const apiProxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  xfwd: true,
  ws: true,
  proxyTimeout: PROXY_TIMEOUT_MS,
  timeout: PROXY_TIMEOUT_MS,
  on: {
    proxyReq(proxyReq, req, res) {
      fixRequestBody(proxyReq, req, res);
    },
    proxyRes(proxyRes) {
      proxyRes.headers["x-safety360-proxy"] = "1";
    },
    error(error, _req, res) {
      console.error("Safety360 proxy upstream error:", error.message);

      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
      }

      res.end(
        JSON.stringify({
          detail: "Safety360 Backend ist momentan nicht erreichbar.",
        }),
      );
    },
  },
});

app.use("/api", apiProxy);

app.use((error, _req, res, _next) => {
  console.error("Safety360 proxy request error:", error.message);

  if (res.headersSent) {
    return;
  }

  res.status(403).json({
    detail: "Anfrage durch Proxy-Sicherheitsregel abgelehnt.",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Safety360 Proxy läuft auf Port ${PORT}.`);
});
