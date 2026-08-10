import { executeLlmCall } from "../steps/llmCall.js";
import { executeHttpRequest } from "../steps/httpRequest.js";
import { executeConditionalBranch } from "../steps/conditionalBranch.js";
import { executeDbWrite } from "../steps/dbWrite.js";
import { executeNotify } from "../steps/notify.js";
import { executeApprovalGate } from "../steps/approvalGate.js";

export async function executeStep({
  step,
  input,
  context
}) {
  switch (step.type) {
    case "llm_call":
      return executeLlmCall({
        step,
        input,
        context
      });

    case "http_request":
      return executeHttpRequest({
        step,
        input,
        context
      });

    case "conditional_branch":
      return executeConditionalBranch({
        step,
        input,
        context
      });

    case "db_write":
      return executeDbWrite({
        step,
        input,
        context
      });

    case "notify":
      return executeNotify({
        step,
        input,
        context
      });

    case "approval_gate":
      return executeApprovalGate({
        step,
        input,
        context
      });

    default:
      throw new Error(
        `Unsupported step type: ${step.type}`
      );
  }
}