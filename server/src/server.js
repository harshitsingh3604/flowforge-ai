import "dotenv/config";
import express from "express";
import cors from "cors";
import { triggerWorkflowRun } from "./actions/triggerWorkflowRun.js";
import { approveStepHandler } from "./actions/approveStep.js";
import { workflowWebhook } from "./webhooks/workflowWebhook.js";
import { notificationEvent } from "./webhooks/notificationEvent.js";
import { webhookWorkflow } from "./actions/webhookWorkflow.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ success: true, service: "flowforge-ai-server", status: "healthy" });
});

app.post("/actions/trigger-workflow-run", triggerWorkflowRun);
app.post("/actions/approve-step", approveStepHandler);
app.post("/actions/webhook-workflow", webhookWorkflow);
app.post("/webhooks/workflow/:workflowId", workflowWebhook);
app.post("/events/notification", notificationEvent);

app.listen(PORT, () => {
  console.log(`FlowForge AI server running on port ${PORT}`);
});
