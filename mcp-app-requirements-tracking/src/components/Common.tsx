/**
 * Small shared widgets: phase stepper, KPI tiles, confidence bar, chips.
 */
import {
  Box,
  Chip,
  LinearProgress,
  Paper,
  Step,
  StepLabel,
  Stepper,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ImplementationStatus, Modality, TenderMeta } from "../types";

const PHASES = ["intake", "bid", "implementation", "closed"] as const;
const PHASE_LABELS: Record<string, string> = {
  intake: "Intake",
  bid: "Bid",
  implementation: "Implementation",
  closed: "Closed",
};

export function PhaseStepper({ tender }: { tender: TenderMeta | null }) {
  const active = tender ? PHASES.indexOf(tender.phase) : 0;
  return (
    <Stepper activeStep={active < 0 ? 0 : active} sx={{ my: 1 }}>
      {PHASES.map((phase) => (
        <Step key={phase} completed={PHASES.indexOf(phase) < active}>
          <StepLabel>
            {PHASE_LABELS[phase]}
            {phase === "bid" && tender?.baselineLabel ? ` (baseline ${tender.baselineLabel})` : ""}
          </StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}

export function KpiTiles({
  tiles,
  onClick,
}: {
  tiles: Array<{ label: string; value: number | string; color?: string; key?: string }>;
  onClick?: (key: string) => void;
}) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", my: 1 }}>
      {tiles.map((tile) => (
        <Paper
          key={tile.label}
          variant="outlined"
          onClick={tile.key && onClick ? () => onClick(tile.key!) : undefined}
          sx={{
            px: 2,
            py: 1,
            minWidth: 110,
            textAlign: "center",
            cursor: tile.key && onClick ? "pointer" : "default",
            borderColor: tile.color ?? undefined,
          }}
        >
          <Typography variant="h5" sx={{ color: tile.color }}>
            {tile.value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {tile.label}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

export function ConfidenceBar({ value }: { value?: number }) {
  if (value === undefined) return null;
  const percent = Math.round(value * 100);
  const color = value >= 0.85 ? "success" : value >= 0.7 ? "warning" : "error";
  return (
    <Tooltip title={`Confidence ${percent}%`}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 90 }}>
        <LinearProgress
          variant="determinate"
          value={percent}
          color={color as any}
          sx={{ flex: 1, height: 6, borderRadius: 3 }}
        />
        <Typography variant="caption" color="text.secondary">
          {percent}%
        </Typography>
      </Box>
    </Tooltip>
  );
}

const MODALITY_COLORS: Record<Modality, "error" | "warning" | "default"> = {
  mandatory: "error",
  target: "warning",
  optional: "default",
};
const MODALITY_LABELS: Record<Modality, string> = {
  mandatory: "MUSS",
  target: "SOLL",
  optional: "KANN",
};

export function ModalityChip({ modality }: { modality: Modality }) {
  return (
    <Chip
      label={MODALITY_LABELS[modality] ?? modality}
      color={MODALITY_COLORS[modality] ?? "default"}
      size="small"
      variant="outlined"
    />
  );
}

const IMPL_COLORS: Record<ImplementationStatus, string> = {
  unplanned: "default",
  planned: "info",
  in_progress: "warning",
  implemented: "success",
  accepted: "success",
};
const IMPL_LABELS: Record<ImplementationStatus, string> = {
  unplanned: "unplanned",
  planned: "planned",
  in_progress: "in progress",
  implemented: "implemented",
  accepted: "accepted ✓",
};

export function ImplStatusChip({ status }: { status?: ImplementationStatus }) {
  if (!status) return null;
  return (
    <Chip
      label={IMPL_LABELS[status] ?? status}
      color={(IMPL_COLORS[status] as any) ?? "default"}
      size="small"
      variant={status === "accepted" ? "filled" : "outlined"}
    />
  );
}

export function ScopeBadge({
  assessment,
}: {
  assessment?: "likely_in_scope" | "likely_change" | "unclear";
}) {
  if (!assessment) return null;
  const map = {
    likely_in_scope: { label: "likely in scope", color: "success" },
    likely_change: { label: "likely CHANGE", color: "warning" },
    unclear: { label: "scope unclear", color: "default" },
  } as const;
  const entry = map[assessment];
  return <Chip label={entry.label} color={entry.color as any} size="small" />;
}
