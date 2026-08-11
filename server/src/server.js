import "dotenv/config";
import express from "express";
import cors from "cors";
import { triggerWorkflowRun } from "./actions/triggerWorkflowRun.js";
import { approveStepHandler } from "./actions/approveStep.js";
import { triggerWorkflowWebhook } from "./actions/triggerWorkflowWebhook.js";
import { workflowWebhook } from "./webhooks/workflowWebhook.js";
import { notificationEvent } from "./webhooks/notificationEvent.js";
import { databaseEvent } from "./webhooks/databaseEvent.js";
import { startScheduler } from "./triggers/scheduler.js";

const app = express();
const PORT = Number(process.env.PORT || 5000);
const allowedOrigins = (process.env.CORS_ORIGINS || "*").split(",").map((item) => item.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ success: true, service: "flowforge-ai-server", status: "healthy", timestamp: new Date().toISOString() });
});

app.post("/actions/trigger-workflow-run", triggerWorkflowRun);
app.post("/actions/approve-step", approveStepHandler);
app.post("/actions/trigger-workflow-webhook", triggerWorkflowWebhook);
app.post("/webhooks/workflow/:workflowId", workflowWebhook);
app.post("/events/notification", notificationEvent);
app.post("/events/database", databaseEvent);

app.use((error, _req, res, _next) => {
  console.error("[HTTP] Unhandled error", error);
  res.status(500).json({ success: false, code: "INTERNAL_SERVER_ERROR", message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`FlowForge AI server running on port ${PORT}`);
  if (process.env.SCHEDULER_ENABLED !== "false") startScheduler();
});
