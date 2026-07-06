/**
 * P-14 Quick Capture — paste area, then a conversational panel: the agent's
 * clarifying questions arrive (max 3, with option chips), answers resume the
 * suspended session, and the resulting proposals land in the Drift Inbox.
 * State is polled via rt_get_capture (~2.5 s while a capture is live).
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import { useCallback, useEffect, useRef, useState } from "react";
import { callTool } from "../api";
import { useAppCtx } from "../app-context";
import { useNav } from "../nav";

interface CaptureQuestion {
  id: string;
  question: string;
  options: string[];
  answer?: string;
  skipped?: boolean;
}

interface CaptureState {
  id: string;
  status: "processing" | "awaiting_answers" | "proposals_ready" | "closed" | "failed";
  questions: CaptureQuestion[];
  proposalIds: string[];
  summary?: any;
}

export function QuickCapture() {
  const { app, project, refreshSummary } = useAppCtx();
  const { navigate } = useNav();
  const [paste, setPaste] = useState("");
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(
    (captureId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const state = await callTool<CaptureState>(app, "rt_get_capture", {
            projectName: project,
            captureId,
          });
          setCapture(state);
          if (state.status === "proposals_ready" || state.status === "failed" || state.status === "closed") {
            stopPolling();
            refreshSummary();
          }
        } catch {
          // transient
        }
      }, 2500);
    },
    [app, project, stopPolling, refreshSummary],
  );

  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await callTool<{ success: boolean; captureId: string }>(
        app,
        "rt_create_capture",
        { projectName: project, pastedText: paste },
      );
      setCapture({ id: result.captureId, status: "processing", questions: [], proposalIds: [] });
      poll(result.captureId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [app, project, paste, poll]);

  const submitAnswers = useCallback(async () => {
    if (!capture) return;
    setBusy(true);
    try {
      await callTool(app, "rt_answer_capture", {
        projectName: project,
        captureId: capture.id,
        answers: capture.questions.map((question) => ({
          questionId: question.id,
          answer: answers[question.id] || undefined,
          skipped: !answers[question.id],
        })),
      });
      setCapture((prev) => (prev ? { ...prev, status: "processing" } : prev));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [app, project, capture, answers]);

  const reset = useCallback(() => {
    stopPolling();
    setCapture(null);
    setPaste("");
    setAnswers({});
  }, [stopPolling]);

  return (
    <Box sx={{ p: 2, overflow: "auto", height: "100%", maxWidth: 860 }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}

      {!capture && (
        <>
          <Typography variant="h6" gutterBottom>
            Paste an email or thread
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            The agent parses the thread, finds requirement-relevant statements, asks up to three
            questions only when an answer would change the outcome, and files proposals into the
            Drift Inbox. Your answers are stored as attestations — the verbatim quotes remain the
            only evidence.
          </Typography>
          <TextField
            multiline
            minRows={12}
            fullWidth
            placeholder={"Von: weber@stadtwerke...\nBetreff: Export-Formate\n..."}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <Button
            variant="contained"
            startIcon={<SendIcon />}
            disabled={busy || paste.trim().length < 20}
            onClick={() => void start()}
            sx={{ mt: 1.5 }}
          >
            Capture
          </Button>
        </>
      )}

      {capture && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontFamily: "monospace" }}>
              {capture.id}
            </Typography>
            <Chip
              label={capture.status.replace(/_/g, " ")}
              size="small"
              color={
                capture.status === "proposals_ready"
                  ? "success"
                  : capture.status === "failed"
                    ? "error"
                    : "info"
              }
            />
            {(capture.status === "processing") && <CircularProgress size={16} />}
            <Box sx={{ flex: 1 }} />
            <Button size="small" onClick={reset}>
              New capture
            </Button>
          </Stack>

          {capture.status === "awaiting_answers" && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                The agent asks:
              </Typography>
              <Stack spacing={2}>
                {capture.questions.map((question) => (
                  <Box key={question.id}>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      {question.question}
                    </Typography>
                    {question.options.length > 0 ? (
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        {question.options.map((option) => (
                          <Chip
                            key={option}
                            label={option}
                            color={answers[question.id] === option ? "primary" : "default"}
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [question.id]: option }))
                            }
                          />
                        ))}
                      </Stack>
                    ) : (
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Answer (leave empty to skip)"
                        value={answers[question.id] ?? ""}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                        }
                      />
                    )}
                  </Box>
                ))}
              </Stack>
              <Button
                variant="contained"
                sx={{ mt: 2 }}
                disabled={busy}
                onClick={() => void submitAnswers()}
              >
                Send answers
              </Button>
            </>
          )}

          {capture.status === "proposals_ready" && (
            <>
              <Alert severity="success" sx={{ mb: 1 }}>
                {capture.proposalIds.length} proposal(s) filed into the Drift Inbox.
              </Alert>
              <Stack direction="row" spacing={1}>
                {capture.proposalIds.map((pid) => (
                  <Chip key={pid} label={pid} size="small" sx={{ fontFamily: "monospace" }} />
                ))}
              </Stack>
              <Button variant="outlined" sx={{ mt: 1.5 }} onClick={() => navigate("drift-inbox")}>
                Open Drift Inbox
              </Button>
            </>
          )}

          {capture.status === "failed" && (
            <Alert severity="error">
              The capture session failed{capture.summary?.error ? `: ${capture.summary.error}` : ""}.
            </Alert>
          )}
        </Paper>
      )}
    </Box>
  );
}
