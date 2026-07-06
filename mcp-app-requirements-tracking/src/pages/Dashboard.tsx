/**
 * P-01 Dashboard — tender card with phase chip and open-work indicators.
 * One etienne project = one tender, so this is a single-tender dashboard with
 * queue shortcuts (the multi-tender dashboard is the host's project list).
 */
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { useAppCtx } from "../app-context";
import { KpiTiles, PhaseStepper } from "../components/Common";
import { useNav, PAGE_TITLES, type PageId } from "../nav";

const QUEUE_PAGES: Array<{ page: PageId; kinds: string[]; description: string }> = [
  { page: "review-queue", kinds: ["extraction"], description: "Proposed requirements awaiting review" },
  { page: "drift-inbox", kinds: ["drift", "progress_update", "acceptance_signal"], description: "Scope-drift cards awaiting a decision" },
  { page: "link-review", kinds: ["link", "shadow_scope"], description: "Issue links and shadow-scope items" },
  { page: "compliance-matrix", kinds: ["mapping", "compliance"], description: "Mappings and verdicts to approve" },
  { page: "catalog-import", kinds: ["catalog_import"], description: "Catalog import segmentations" },
];

export function Dashboard() {
  const { tender, counts } = useAppCtx();
  const { navigate } = useNav();

  const openFor = (kinds: string[]) =>
    kinds.reduce((sum, kind) => sum + (counts?.openProposalsByKind?.[kind] ?? 0), 0);

  return (
    <Box sx={{ p: 2, overflow: "auto", height: "100%" }}>
      <Typography variant="h5" gutterBottom>
        {tender?.title ?? "Tender"}{" "}
        <Chip label={tender?.key ?? "—"} size="small" sx={{ fontFamily: "monospace", ml: 1 }} />
      </Typography>
      <PhaseStepper tender={tender} />

      <KpiTiles
        tiles={[
          { label: "Documents", value: counts?.documents ?? 0 },
          { label: "Requirements", value: counts?.requirements ?? 0 },
          {
            label: "Conflicts",
            value: counts?.unresolvedConflicts ?? 0,
            color: (counts?.unresolvedConflicts ?? 0) > 0 ? "#d32f2f" : undefined,
          },
          {
            label: "Stale links",
            value: counts?.staleLinks ?? 0,
            color: (counts?.staleLinks ?? 0) > 0 ? "#ed6c02" : undefined,
          },
          { label: "Open captures", value: counts?.openCaptures ?? 0 },
        ]}
      />

      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
        Open work
      </Typography>
      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
        {QUEUE_PAGES.map((queue) => {
          const open = openFor(queue.kinds);
          return (
            <Card key={queue.page} variant="outlined" sx={{ width: 250 }}>
              <CardActionArea onClick={() => navigate(queue.page)}>
                <CardContent>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="subtitle1">{PAGE_TITLES[queue.page]}</Typography>
                    <Chip
                      label={`${open} open`}
                      color={open > 0 ? "primary" : "default"}
                      size="small"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {queue.description}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
        <Card variant="outlined" sx={{ width: 250 }}>
          <CardActionArea onClick={() => navigate("deviation-report")}>
            <CardContent>
              <Typography variant="subtitle1">Deviation Report</Typography>
              <Typography variant="body2" color="text.secondary">
                What changed since the baseline — on demand, snapshotted.
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
        <Card variant="outlined" sx={{ width: 250 }}>
          <CardActionArea onClick={() => navigate("quick-capture")}>
            <CardContent>
              <Typography variant="subtitle1">Quick Capture</Typography>
              <Typography variant="body2" color="text.secondary">
                Paste an email — the agent asks, you answer, cards appear.
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      </Stack>
    </Box>
  );
}
