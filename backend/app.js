import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

import authRoutes from "./routes/auth.js";
import problemRoutes from "./routes/problem.js";
import submissionRoutes from "./routes/submission.js";
import executeRoutes from "./routes/execute.js";
import nftRoutes from "./routes/nft.js";
import pollRoutes from "./routes/poll.js";
import progressRoutes from "./routes/progress.js";
import govRoutes from "./routes/gov.js";
import voteRoutes from "./routes/vote.js";

const app = express();

app.use(cors());
app.use(morgan("[:date[iso]] :method :url :status :response-time ms - :res[content-length]"));
app.use(express.json());

// Connect to MongoDB (cached across serverless invocations)
let cached = globalThis.__mongoCache;
if (!cached) cached = globalThis.__mongoCache = { conn: null, promise: null };

export function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGO_URI)
      .then((m) => {
        console.log("MongoDB Connected");
        return m;
      })
      .catch((err) => {
        console.error("MongoDB connection error:", err.message);
        throw err;
      });
  }
  cached.conn = cached.promise;
  return cached.conn;
}

// Routes — mounted under /api since Vercel's rewrite forwards the full path
app.use("/api/auth", authRoutes);
app.use("/api/problems", problemRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/execute", executeRoutes);
app.use("/api/nft", nftRoutes);
app.use("/api/poll", pollRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/gov", govRoutes);
app.use("/api/vote", voteRoutes);

// Health check
app.get("/api", (req, res) => res.json({ ok: true, service: "chaincode-api" }));

// Central error middleware — must be last. Converts thrown errors (including
// JSON parse failures from express.json) into consistent JSON responses
// instead of Vercel's HTML error page.
app.use((err, req, res, _next) => {
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ msg: "Invalid JSON body" });
  }
  console.error(`[${req.method} ${req.path}]`, err.stack || err.message);
  res.status(err.status || 500).json({
    msg: process.env.NODE_ENV === "production" ? "Server error" : err.message,
  });
});

// Ensure a connection attempt has started before the request handler runs
await connectDB().catch(() => {});

export default app;
