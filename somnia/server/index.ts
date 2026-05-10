import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const isProd = NODE_ENV === "production";

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[xenia] SESSION_SECRET is not set — falling back to an insecure dev default. Set SESSION_SECRET in production.",
  );
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (NeonDB connection string).");
}

const app = express();

// ─── Core middleware ────────────────────────────────────────────────────────
app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, cb) => {
      const allowed = (
        process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:3000"
      )
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!origin || allowed.includes(origin)) return cb(null, true);
      return cb(null, true); // permissive for the Twitter content script / extension
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─── Session store (Postgres via connect-pg-simple) ─────────────────────────
const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "sessions",
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET ?? "xenia-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7d
    },
    name: "xenia.sid",
  }),
);

// ─── Request logging (lightweight) ──────────────────────────────────────────
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    const start = Date.now();
    _res.on("finish", () => {
      const ms = Date.now() - start;
      console.log(
        `[xenia] ${req.method} ${req.path} -> ${_res.statusCode} ${ms}ms`,
      );
    });
  }
  next();
});

// ─── Health check ───────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      service: "xenia",
      env: NODE_ENV,
      time: new Date().toISOString(),
    },
  });
});

// ─── App routes ─────────────────────────────────────────────────────────────
await registerRoutes(app);

// ─── Static client (production) or dev fallback ─────────────────────────────
const clientDist = path.resolve(__dirname, "../dist/public");
const clientIndex = path.join(clientDist, "index.html");

if (isProd && fs.existsSync(clientIndex)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(clientIndex);
  });
} else {
  app.get("/", (_req, res) => {
    res
      .status(200)
      .send(
        "<h1>Xenia API (dev)</h1><p>Run <code>vite</code> for the client. API is mounted at <code>/api</code>.</p>",
      );
  });
}

// ─── Error handler ──────────────────────────────────────────────────────────
app.use(
  (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[xenia] error:", err);
    const status =
      typeof (err as { status?: number })?.status === "number"
        ? (err as { status: number }).status
        : 500;
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    res.status(status).json({
      success: false,
      error: {
        code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
        message: status >= 500 ? "Internal Server Error" : message,
      },
    });
  },
);

app.listen(PORT, () => {
  console.log(`Xenia server running on port ${PORT} (${NODE_ENV})`);
});
