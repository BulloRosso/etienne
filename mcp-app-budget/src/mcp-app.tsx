/**
 * Budget Donut Chart — MCP App (React)
 *
 * Receives a .budget.json file's content via MCP tool result,
 * parses the budget items, and renders an interactive SVG donut chart.
 */
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import s from "./mcp-app.module.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BudgetItem {
  item: string;
  amount: number;
  currency: string;
}

interface BudgetData {
  budget: BudgetItem[];
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
  "#e11d48", "#84cc16", "#a855f7", "#0ea5e9", "#d946ef",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractJson<T>(result: CallToolResult): T {
  const textContent = result.content?.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("No text in result");
  return JSON.parse(textContent.text) as T;
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

function DonutChart({ items }: { items: BudgetItem[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const currency = items[0]?.currency || "EUR";

  // Build arc segments
  const cx = 100, cy = 100, r = 70, strokeWidth = 30;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  const segments = items.map((item, idx) => {
    const pct = total > 0 ? item.amount / total : 0;
    const dashLen = pct * circumference;
    const dashOffset = -offset;
    offset += dashLen;

    return {
      item,
      idx,
      pct,
      dashLen,
      dashOffset,
      color: COLORS[idx % COLORS.length],
    };
  });

  return (
    <div className={s.chartContainer}>
      <div className={s.donutWrapper}>
        <svg viewBox="0 0 200 200" className={s.donut}>
          {/* Background circle */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border-primary)" strokeWidth={strokeWidth} />

          {/* Segments */}
          {segments.map((seg) => (
            <circle
              key={seg.idx}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={hoveredIdx === seg.idx ? strokeWidth + 6 : strokeWidth}
              strokeDasharray={`${seg.dashLen} ${circumference - seg.dashLen}`}
              strokeDashoffset={seg.dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: "stroke-width 0.15s", cursor: "pointer" }}
              onMouseEnter={() => setHoveredIdx(seg.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}

          {/* Center text */}
          <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="10">
            Total
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--color-text-primary)" fontSize="14" fontWeight="600">
            {formatAmount(total, currency)}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className={s.legend}>
        {segments.map((seg) => (
          <div
            key={seg.idx}
            className={`${s.legendItem} ${hoveredIdx === seg.idx ? s.legendItemHover : ""}`}
            onMouseEnter={() => setHoveredIdx(seg.idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <span className={s.legendDot} style={{ backgroundColor: seg.color }} />
            <span className={s.legendLabel}>{seg.item.item}</span>
            <span className={s.legendAmount}>{formatAmount(seg.item.amount, seg.item.currency)}</span>
            <span className={s.legendPct}>{(seg.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Root component ──────────────────────────────────────────────────────────

function BudgetApp() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [_hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: "Budget Donut Chart", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onteardown = async () => ({});
      app.ontoolinput = async () => {};
      app.ontoolresult = async (result) => setToolResult(result);
      app.ontoolcancelled = () => {};
      app.onerror = console.error;
      app.onhostcontextchanged = (params) =>
        setHostContext((prev) => ({ ...prev, ...params }));
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  if (error) return <div className={s.error}>Error: {error.message}</div>;
  if (!app) return <div className={s.loading}><span className={s.spinner} /> Connecting...</div>;

  if (!toolResult) {
    return <div className={s.loading}>Waiting for budget data...</div>;
  }

  let data: BudgetData;
  try {
    data = extractJson<BudgetData>(toolResult);
  } catch {
    return <div className={s.error}>Failed to parse budget data</div>;
  }

  if (!data.budget || data.budget.length === 0) {
    return <div className={s.loading}>No budget items found</div>;
  }

  return (
    <div className={s.main}>
      <h2 className={s.title}>Budget Overview</h2>
      <DonutChart items={data.budget} />
    </div>
  );
}

// ─── Mount ───────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BudgetApp />
  </StrictMode>,
);
