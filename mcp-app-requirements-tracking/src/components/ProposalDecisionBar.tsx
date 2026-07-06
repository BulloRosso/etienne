/**
 * The human approval gate rendered as a button group. Handles the
 * first-writer-wins contract: a {conflict:true} result shows who won instead
 * of pretending success (spec §9.4).
 */
import { Alert, Button, ButtonGroup, CircularProgress, Snackbar } from "@mui/material";
import { useCallback, useState } from "react";
import type { DecideResult } from "../types";

export interface DecisionAction {
  decision: string;
  label: string;
  color?: "primary" | "success" | "warning" | "error" | "inherit";
  needsNote?: boolean;
}

export function ProposalDecisionBar({
  actions,
  onDecide,
  disabled,
}: {
  actions: DecisionAction[];
  onDecide: (decision: string) => Promise<DecideResult>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; severity: "success" | "warning" | "error" } | null>(null);

  const handle = useCallback(
    async (decision: string) => {
      setBusy(decision);
      try {
        const result = await onDecide(decision);
        if (result.conflict) {
          setMessage({
            text: `Already decided: ${result.winning?.decision} by ${result.winning?.decidedBy ?? "someone else"}`,
            severity: "warning",
          });
        } else if (result.blocked) {
          setMessage({
            text: `Blocked: ${JSON.stringify(result.blockers ?? [])}`,
            severity: "error",
          });
        } else if (!result.success) {
          setMessage({ text: result.error ?? "Decision failed", severity: "error" });
        } else {
          setMessage({ text: `Decided: ${decision}`, severity: "success" });
        }
      } catch (error: any) {
        setMessage({ text: error?.message ?? String(error), severity: "error" });
      } finally {
        setBusy(null);
      }
    },
    [onDecide],
  );

  return (
    <>
      <ButtonGroup size="small" disabled={disabled || busy !== null}>
        {actions.map((action) => (
          <Button
            key={action.decision}
            color={action.color ?? "primary"}
            onClick={() => void handle(action.decision)}
            startIcon={busy === action.decision ? <CircularProgress size={14} /> : undefined}
          >
            {action.label}
          </Button>
        ))}
      </ButtonGroup>
      <Snackbar
        open={message !== null}
        autoHideDuration={4000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={message?.severity ?? "info"} onClose={() => setMessage(null)}>
          {message?.text}
        </Alert>
      </Snackbar>
    </>
  );
}
