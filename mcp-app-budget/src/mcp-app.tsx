/**
 * Budget Donut Chart — MCP App (React)
 *
 * Receives a .budget.json file's content via MCP tool result,
 * parses the budget items, and renders an interactive SVG donut chart
 * with multi-select. Selected items are reported to the host via postMessage
 * so the LLM chat context knows what the user has selected.
 */
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useState } from "react";
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
  let parsed = JSON.parse(textContent.text);
  // Unwrap double-wrapped MCP format: [{ type: 'text', text: '...' }]
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type === 'text' && parsed[0]?.text) {
    parsed = JSON.parse(parsed[0].text);
  }
  return parsed as T;
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Post viewer state to the host (McpUIPreview) so the chat context
 * knows which budget items are selected.
 */
function postSelectionToHost(items: BudgetItem[], selectedIndices: Set<number>) {
  const selectedItems = [...selectedIndices].map(i => items[i]).filter(Boolean);
  try {
    window.parent.postMessage({
      type: 'viewer-state-update',
      state: { selectedItems },
    }, '*');
  } catch {
    // Ignore if postMessage fails (e.g., same-origin restrictions)
  }
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

function DonutChart({ items, selectedSet, onToggleSelect, onSetSelection }: {
  items: BudgetItem[];
  selectedSet: Set<number>;
  onToggleSelect: (idx: number) => void;
  onSetSelection: (indices: Set<number>) => void;
}) {
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

  const selectedCount = selectedSet.size;
  const selectedTotal = [...selectedSet].reduce((sum, i) => sum + (items[i]?.amount || 0), 0);

  return (
    <div className={s.chartContainer}>
      {selectedCount > 0 && (
        <div className={s.selectionBar}>
          {selectedCount} item{selectedCount > 1 ? "s" : ""} selected — {formatAmount(selectedTotal, currency)}
          <button className={s.clearBtn} onClick={() => { onSetSelection(new Set()); postSelectionToHost(items, new Set()); }}>
            Clear
          </button>
        </div>
      )}

      <div className={s.donutWrapper}>
        <svg viewBox="0 0 200 200" className={s.donut}>
          {/* Background circle */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border-primary)" strokeWidth={strokeWidth} />

          {/* Segments */}
          {segments.map((seg) => {
            const isSelected = selectedSet.has(seg.idx);
            const isHovered = hoveredIdx === seg.idx;
            return (
              <circle
                key={seg.idx}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={isSelected ? seg.color : (isHovered ? seg.color : seg.color)}
                strokeWidth={isSelected ? strokeWidth + 8 : (isHovered ? strokeWidth + 4 : strokeWidth)}
                strokeDasharray={`${seg.dashLen} ${circumference - seg.dashLen}`}
                strokeDashoffset={seg.dashOffset}
                transform={`rotate(-90 ${cx} ${cy})`}
                opacity={selectedSet.size > 0 && !isSelected ? 0.35 : 1}
                style={{ transition: "stroke-width 0.15s, opacity 0.15s", cursor: "pointer" }}
                onMouseEnter={() => setHoveredIdx(seg.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => onToggleSelect(seg.idx)}
              >
                <title>{seg.item.item} — {formatAmount(seg.item.amount, seg.item.currency)} ({(seg.pct * 100).toFixed(1)}%)</title>
              </circle>
            );
          })}

          {/* Center text */}
          <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="10">
            {selectedCount > 0 ? "Selected" : "Total"}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--color-text-primary)" fontSize="14" fontWeight="600">
            {formatAmount(selectedCount > 0 ? selectedTotal : total, currency)}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className={s.legend}>
        {segments.map((seg) => {
          const isSelected = selectedSet.has(seg.idx);
          return (
            <div
              key={seg.idx}
              className={`${s.legendItem} ${hoveredIdx === seg.idx ? s.legendItemHover : ""} ${isSelected ? s.legendItemSelected : ""}`}
              onMouseEnter={() => setHoveredIdx(seg.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onToggleSelect(seg.idx)}
            >
              <span className={s.legendCheck}>{isSelected ? "✓" : ""}</span>
              <span className={s.legendDot} style={{ backgroundColor: seg.color, opacity: selectedSet.size > 0 && !isSelected ? 0.35 : 1 }} />
              <span className={s.legendLabel} style={{ opacity: selectedSet.size > 0 && !isSelected ? 0.5 : 1 }}>{seg.item.item}</span>
              <span className={s.legendAmount}>{formatAmount(seg.item.amount, seg.item.currency)}</span>
              <span className={s.legendPct}>{(seg.pct * 100).toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Root component ──────────────────────────────────────────────────────────

function BudgetApp() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [_hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const [selectedSet, setSelectedSet] = useState<Set<number>>(new Set());
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);

  // Ref to dispatch commands without re-creating the useApp callback
  const commandDispatchRef = useCallback((payload: any) => {
    // Dispatch as a message event that the viewer-command listener picks up
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'viewer-command', action: payload._action, payload },
    }));
  }, []);

  const { app, error } = useApp({
    appInfo: { name: "Budget Donut Chart", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onteardown = async () => ({});
      app.ontoolinput = async () => {};
      app.ontoolresult = async (result) => {
        // Check if this is an action command (not data to render)
        try {
          const textContent = result.content?.find((c: any) => c.type === "text");
          if (textContent && textContent.type === "text") {
            let parsed = JSON.parse(textContent.text);
            // Unwrap double-wrapped MCP format: [{ type: 'text', text: '...' }]
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type === 'text' && parsed[0]?.text) {
              parsed = JSON.parse(parsed[0].text);
            }
            if (parsed?._action) {
              commandDispatchRef(parsed);
              return; // Don't overwrite budget data
            }
          }
        } catch { /* not an action — treat as data */ }
        setToolResult(result);
      };
      app.ontoolcancelled = () => {};
      app.onerror = console.error;
      app.onhostcontextchanged = (params) =>
        setHostContext((prev) => ({ ...prev, ...params }));
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  // Listen for viewer commands from the host (model-driven state changes)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'viewer-command') return;
      const { action, payload } = event.data;

      if (action === 'select' && budgetItems.length > 0) {
        const mode: string = payload?.mode || 'replace';
        let targetIndices: number[] = [];

        // Resolve indices from item labels
        if (payload?.items && Array.isArray(payload.items)) {
          targetIndices = payload.items
            .map((label: string) => budgetItems.findIndex(b => b.item === label))
            .filter((i: number) => i >= 0);
        }
        // Resolve from explicit indices
        if (payload?.indices && Array.isArray(payload.indices)) {
          targetIndices = [...targetIndices, ...payload.indices.filter((i: number) => i >= 0 && i < budgetItems.length)];
        }

        setSelectedSet(prev => {
          let next: Set<number>;
          switch (mode) {
            case 'add':
              next = new Set([...prev, ...targetIndices]);
              break;
            case 'remove':
              next = new Set([...prev].filter(i => !targetIndices.includes(i)));
              break;
            case 'clear':
              next = new Set();
              break;
            case 'replace':
            default:
              next = new Set(targetIndices);
              break;
          }
          postSelectionToHost(budgetItems, next);
          return next;
        });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [budgetItems]);

  // Toggle selection (user click)
  const handleToggleSelect = useCallback((idx: number) => {
    setSelectedSet(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      postSelectionToHost(budgetItems, next);
      return next;
    });
  }, [budgetItems]);

  // Parse budget data from tool result
  const data: BudgetData | null = (() => {
    if (!toolResult) return null;
    try {
      const parsed = extractJson<BudgetData>(toolResult);
      return parsed?.budget?.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  })();

  // Keep budgetItems in sync for the message handler
  useEffect(() => {
    if (data?.budget && data.budget.length > 0) {
      setBudgetItems(data.budget);
    }
  }, [data?.budget?.length, toolResult]);

  if (error) return <div className={s.error}>Error: {error.message}</div>;
  if (!app) return <div className={s.loading}><span className={s.spinner} /> Connecting...</div>;
  if (!toolResult) return <div className={s.loading}>Waiting for budget data...</div>;
  if (!data) return <div className={s.error}>Failed to parse budget data</div>;

  return (
    <div className={s.main}>
      <h2 className={s.title}>Budget Overview</h2>
      <DonutChart
        items={data.budget}
        selectedSet={selectedSet}
        onToggleSelect={handleToggleSelect}
        onSetSelection={(next) => { setSelectedSet(next); postSelectionToHost(data.budget, next); }}
      />
    </div>
  );
}

// ─── Mount ───────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BudgetApp />
  </StrictMode>,
);
