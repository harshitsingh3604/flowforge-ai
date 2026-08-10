import "dotenv/config";
import express from "express";
import cors from "cors";

import { triggerWorkflowRun } from "./actions/triggerWorkflowRun.js";
import { approveStepHandler } from "./actions/approveStep.js";


const app = express();

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "flowforge-ai-server",
    status: "healthy",
  });
});

app.post("/actions/trigger-workflow-run", triggerWorkflowRun);

app.post("/actions/approve-step", approveStepHandler);

app.listen(PORT, () => {
  console.log(`FlowForge AI server running on port ${PORT}`);
});
