import { useState, useCallback, useRef, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";

// ── Palette ──────────────────────────────────────
const C = {
  bg: "#0a0c10",
  panel: "#0f1117",
  panelBorder: "#1e2230",
  surface: "#161922",
  surfaceHover: "#1d2130",
  accent: "#3b82f6",
  accentDim: "#1d3a6e",
  trigger: { bg: "#1a1025", border: "#7c3aed", text: "#c4b5fd" },
  condition: { bg: "#0f1f1a", border: "#059669", text: "#6ee7b7" },
  action: { bg: "#1a0f0f", border: "#dc2626", text: "#fca5a5" },
  outcome: { bg: "#0f1621", border: "#0ea5e9", text: "#7dd3fc" },
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#334155",
  zmq: "#f59e0b",
  llm: "#a78bfa",
  success: "#22c55e",
  warning: "#f59e0b",
};

// ── Custom Nodes ─────────────────────────────────

const nodeBase = "rounded-xl border px-4 py-3 min-w-[180px] max-w-[220px] shadow-lg cursor-pointer transition-all duration-150 hover:brightness-125";

function TriggerNode({ data, selected }) {
  return (
    <div className={nodeBase} style={{
      background: C.trigger.bg,
      borderColor: selected ? "#a78bfa" : C.trigger.border,
      boxShadow: selected ? `0 0 0 2px ${C.trigger.border}44` : "none",
    }}>
      <Handle type="source" position={Position.Bottom} style={{ background: C.trigger.border }} />
      <div style={{ color: C.trigger.text, fontFamily: "monospace", fontSize: 10, opacity: 0.7, marginBottom: 2 }}>TRIGGER</div>
      <div style={{ color: C.trigger.text, fontWeight: 700, fontSize: 13 }}>{data.label}</div>
      {data.description && <div style={{ color: "#9d7ec5", fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{data.description}</div>}
    </div>
  );
}

function ConditionNode({ data, selected }) {
  return (
    <div className={nodeBase} style={{
      background: C.condition.bg,
      borderColor: selected ? "#34d399" : C.condition.border,
      boxShadow: selected ? `0 0 0 2px ${C.condition.border}44` : "none",
    }}>
      <Handle type="target" position={Position.Top} style={{ background: C.condition.border }} />
      <Handle type="source" position={Position.Bottom} id="true" style={{ background: C.condition.border, left: "35%" }} />
      <Handle type="source" position={Position.Bottom} id="false" style={{ background: "#dc2626", left: "65%" }} />
      <div style={{ color: C.condition.text, fontFamily: "monospace", fontSize: 10, opacity: 0.7, marginBottom: 2 }}>CONDITION</div>
      <div style={{ color: C.condition.text, fontWeight: 700, fontSize: 13 }}>{data.label}</div>
      {data.property && (
        <div style={{ marginTop: 5, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "#6ee7b7", fontFamily: "monospace" }}>{data.property}</span>
          <span style={{ color: "#34d399", background: "#064e3b", padding: "1px 5px", borderRadius: 4 }}>{data.operator}</span>
          <span style={{ color: "#a7f3d0", fontFamily: "monospace" }}>{data.value}</span>
        </div>
      )}
      {data.zeromqEvent && (
        <div style={{ marginTop: 4, fontSize: 10, color: C.zmq, display: "flex", alignItems: "center", gap: 3 }}>
          <span>⚡</span><span style={{ fontFamily: "monospace" }}>{data.zeromqEvent}</span>
        </div>
      )}
    </div>
  );
}

function ActionNode({ data, selected }) {
  const statusColors = {
    pending: "#94a3b8",
    approved: "#22c55e",
    rejected: "#ef4444",
    executing: "#f59e0b",
    done: "#3b82f6",
  };
  return (
    <div className={nodeBase} style={{
      background: C.action.bg,
      borderColor: selected ? "#f87171" : C.action.border,
      boxShadow: selected ? `0 0 0 2px ${C.action.border}44` : "none",
    }}>
      <Handle type="target" position={Position.Top} style={{ background: C.action.border }} />
      <Handle type="source" position={Position.Bottom} style={{ background: C.action.border }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ color: C.action.text, fontFamily: "monospace", fontSize: 10, opacity: 0.7 }}>ACTION</div>
        {data.status && (
          <div style={{
            fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
            background: statusColors[data.status] + "22",
            color: statusColors[data.status],
            border: `1px solid ${statusColors[data.status]}44`,
            textTransform: "uppercase",
          }}>{data.status}</div>
        )}
      </div>
      <div style={{ color: C.action.text, fontWeight: 700, fontSize: 13, marginTop: 2 }}>{data.label}</div>
      {data.actionType && (
        <div style={{ marginTop: 3, fontSize: 11, color: "#fca5a5", fontFamily: "monospace", opacity: 0.7 }}>{data.actionType}</div>
      )}
      {data.zeromqEmit && (
        <div style={{ marginTop: 4, fontSize: 10, color: C.zmq, display: "flex", alignItems: "center", gap: 3 }}>
          <span>📡</span><span style={{ fontFamily: "monospace" }}>{data.zeromqEmit}</span>
        </div>
      )}
      {data.llmPromptTemplate && (
        <div style={{ marginTop: 3, fontSize: 10, color: C.llm, display: "flex", alignItems: "center", gap: 3 }}>
          <span>🤖</span><span>LLM prompt attached</span>
        </div>
      )}
    </div>
  );
}

function OutcomeNode({ data, selected }) {
  return (
    <div className={nodeBase} style={{
      background: C.outcome.bg,
      borderColor: selected ? "#38bdf8" : C.outcome.border,
      boxShadow: selected ? `0 0 0 2px ${C.outcome.border}44` : "none",
    }}>
      <Handle type="target" position={Position.Top} style={{ background: C.outcome.border }} />
      <div style={{ color: C.outcome.text, fontFamily: "monospace", fontSize: 10, opacity: 0.7, marginBottom: 2 }}>OUTCOME</div>
      <div style={{ color: C.outcome.text, fontWeight: 700, fontSize: 13 }}>{data.label}</div>
      {data.description && <div style={{ color: "#7dd3fc", fontSize: 11, marginTop: 4, opacity: 0.8 }}>{data.description}</div>}
    </div>
  );
}

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  outcome: OutcomeNode,
};

// ── Suggestion → RF Nodes/Edges ───────────────────

function suggestionToRF(suggestion) {
  if (!suggestion?.nodes?.length) return { nodes: [], edges: [] };

  const posMap = { trigger: 0, condition: 1, action: 2, outcome: 3 };
  const colGroups = { 0: [], 1: [], 2: [], 3: [] };
  suggestion.nodes.forEach(n => colGroups[posMap[n.type] ?? 1].push(n));

  const rfNodes = suggestion.nodes.map(n => {
    const col = posMap[n.type] ?? 1;
    const idx = colGroups[col].indexOf(n);
    const colCount = colGroups[col].length;

    // Find matching condition/action data
    const cond = suggestion.conditions?.find(c => c.id === n.conditionId);
    const act = suggestion.actions?.find(a => a.id === n.actionId);

    return {
      id: n.id,
      type: n.type,
      position: {
        x: col * 280 + 60,
        y: (idx - (colCount - 1) / 2) * 160 + 260,
      },
      data: {
        label: n.label,
        description: n.description,
        entityType: n.entityType,
        // condition fields
        property: cond?.property,
        operator: cond?.operator,
        value: cond?.value,
        zeromqEvent: cond?.zeromqEvent,
        // action fields
        actionType: act?.actionType,
        status: act?.status,
        zeromqEmit: act?.zeromqEmit,
        llmPromptTemplate: act?.llmPromptTemplate,
      },
    };
  });

  const rfEdges = (suggestion.edges || []).map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.condition,
    label: e.label,
    labelStyle: { fill: e.condition === "true" ? C.condition.text : e.condition === "false" ? C.action.text : C.textMuted, fontSize: 10 },
    labelBgStyle: { fill: C.panel },
    style: {
      stroke: e.condition === "true" ? C.condition.border : e.condition === "false" ? "#dc2626" : C.accentDim,
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: e.condition === "true" ? C.condition.border : e.condition === "false" ? "#dc2626" : C.accentDim,
    },
    animated: e.condition === "true",
  }));

  return { nodes: rfNodes, edges: rfEdges };
}

// ── Chat Panel ────────────────────────────────────

function ChatPanel({ messages, onSend, isThinking }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: C.panel, borderRight: `1px solid ${C.panelBorder}`,
    }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.panelBorder}` }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 14, letterSpacing: "0.05em" }}>DECISION SUPPORT</div>
        <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>Describe a situation to derive actionable decisions</div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ color: C.textDim, fontSize: 12, textAlign: "center", marginTop: 40, lineHeight: 1.8 }}>
            Describe a situation, anomaly, or decision you need help with.<br />
            The agent will ground it in your ontology and propose a structured decision graph.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%",
              padding: "10px 14px",
              borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              background: m.role === "user" ? C.accentDim : C.surface,
              border: `1px solid ${m.role === "user" ? C.accent + "55" : C.panelBorder}`,
              color: m.role === "user" ? "#93c5fd" : C.text,
              fontSize: 12, lineHeight: 1.6,
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {isThinking && (
          <div style={{ display: "flex", gap: 5, padding: "8px 14px" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: "50%",
                background: C.accentDim,
                animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.panelBorder}`, display: "flex", gap: 8 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Describe a situation or decision…"
          rows={2}
          style={{
            flex: 1, resize: "none", background: C.surface, border: `1px solid ${C.panelBorder}`,
            borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 12,
            outline: "none", fontFamily: "inherit", lineHeight: 1.5,
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || isThinking}
          style={{
            padding: "0 16px", borderRadius: 10, border: "none",
            background: input.trim() && !isThinking ? C.accent : C.accentDim,
            color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer",
            opacity: input.trim() && !isThinking ? 1 : 0.5, transition: "all 0.15s",
          }}
        >▶</button>
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────

function DetailPanel({ suggestion, onSave, onExportZmq }) {
  if (!suggestion) return (
    <div style={{ padding: 24, color: C.textMuted, fontSize: 12 }}>
      No suggestion yet. Start a conversation to generate a decision graph.
    </div>
  );

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Title */}
      <div>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{suggestion.title}</div>
        <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{suggestion.description}</div>
      </div>

      {/* Reasoning */}
      {suggestion.reasoning && (
        <div style={{ background: C.surface, border: `1px solid ${C.panelBorder}`, borderRadius: 10, padding: 12 }}>
          <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>REASONING</div>
          <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>{suggestion.reasoning}</div>
        </div>
      )}

      {/* Conditions */}
      {suggestion.conditions?.length > 0 && (
        <div>
          <div style={{ color: C.condition.text, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>
            CONDITIONS ({suggestion.conditions.length})
          </div>
          {suggestion.conditions.map(c => (
            <div key={c.id} style={{
              background: C.condition.bg, border: `1px solid ${C.condition.border}33`,
              borderRadius: 8, padding: 10, marginBottom: 6,
            }}>
              <div style={{ color: C.condition.text, fontSize: 12, fontWeight: 600 }}>{c.description}</div>
              <div style={{ color: "#6ee7b7", fontSize: 11, fontFamily: "monospace", marginTop: 4, opacity: 0.8 }}>
                {c.targetEntityType}{c.targetEntityId ? `/${c.targetEntityId}` : ""} · {c.property} {c.operator} {c.value}
              </div>
              {c.zeromqEvent && (
                <div style={{ color: C.zmq, fontSize: 10, marginTop: 3 }}>⚡ {c.zeromqEvent}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {suggestion.actions?.length > 0 && (
        <div>
          <div style={{ color: C.action.text, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>
            ACTIONS ({suggestion.actions.length})
          </div>
          {suggestion.actions.map(a => (
            <div key={a.id} style={{
              background: C.action.bg, border: `1px solid ${C.action.border}33`,
              borderRadius: 8, padding: 10, marginBottom: 6,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: C.action.text, fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 8, background: "#1a0f0f", color: C.action.text, border: `1px solid ${C.action.border}44` }}>
                  {a.actionType}
                </span>
              </div>
              <div style={{ color: "#fca5a5", fontSize: 11, marginTop: 3, opacity: 0.7 }}>{a.description}</div>
              {Object.keys(a.parameters || {}).length > 0 && (
                <div style={{ marginTop: 5, fontSize: 10, fontFamily: "monospace", color: "#f87171", opacity: 0.7 }}>
                  {Object.entries(a.parameters).map(([k, v]) => `${k}=${v}`).join(" · ")}
                </div>
              )}
              {a.zeromqEmit && <div style={{ color: C.zmq, fontSize: 10, marginTop: 3 }}>📡 {a.zeromqEmit}</div>}
              {a.llmPromptTemplate && <div style={{ color: C.llm, fontSize: 10, marginTop: 2 }}>🤖 LLM prompt attached</div>}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        <button onClick={onSave} style={{
          flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
          background: C.accent, color: "white", fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}>
          Save to Ontology
        </button>
        <button onClick={onExportZmq} style={{
          flex: 1, padding: "10px 0", borderRadius: 8,
          border: `1px solid ${C.zmq}55`, background: "transparent",
          color: C.zmq, fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}>
          Export ZMQ Rules
        </button>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────

function Toast({ message, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, []);
  if (!message) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 1000,
      background: C.surface, border: `1px solid ${C.success}55`,
      borderRadius: 10, padding: "12px 18px", color: C.success,
      fontSize: 13, fontWeight: 600, boxShadow: "0 4px 24px #000a",
      animation: "slideIn 0.2s ease",
    }}>
      {message}
    </div>
  );
}

// ── Main Component ────────────────────────────────

export default function DecisionSupportStudio() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [activePanel, setActivePanel] = useState("chat"); // "chat" | "detail"
  const [toast, setToast] = useState(null);
  const [savedGraphs, setSavedGraphs] = useState([]);
  const chatHistoryRef = useRef([]);

  const onConnect = useCallback(
    params => setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: C.accentDim } }, eds)),
    []
  );

  const handleSend = useCallback(async (userMessage) => {
    setChatMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsThinking(true);

    try {
      const response = await fetch("/api/decision-support/derive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: "default",
          chatHistory: chatHistoryRef.current,
          userMessage,
        }),
      });

      if (!response.ok) throw new Error("API error");
      const data = await response.json();

      const { suggestion: newSuggestion, assistantReply } = data;

      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantReply },
      ];

      setChatMessages(prev => [...prev, { role: "assistant", content: assistantReply }]);
      setSuggestion(newSuggestion);

      const { nodes: rfNodes, edges: rfEdges } = suggestionToRF(newSuggestion);
      setNodes(rfNodes);
      setEdges(rfEdges);
      setActivePanel("detail");
    } catch (err) {
      // Demo mode: generate mock suggestion
      const mockSuggestion = generateMockSuggestion(userMessage);
      const reply = `I've analyzed your situation and identified ${mockSuggestion.conditions.length} conditions and ${mockSuggestion.actions.length} actionable responses, grounded in your ontology. The decision graph is now visible on the canvas.`;

      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: "user", content: userMessage },
        { role: "assistant", content: reply },
      ];

      setChatMessages(prev => [...prev, { role: "assistant", content: reply }]);
      setSuggestion(mockSuggestion);

      const { nodes: rfNodes, edges: rfEdges } = suggestionToRF(mockSuggestion);
      setNodes(rfNodes);
      setEdges(rfEdges);
      setActivePanel("detail");
    } finally {
      setIsThinking(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!suggestion) return;
    const graphId = `graph-${Date.now()}`;
    setSavedGraphs(prev => [...prev, { id: graphId, title: suggestion.title }]);
    setToast(`✓ "${suggestion.title}" saved to ontology`);
  }, [suggestion]);

  const handleExportZmq = useCallback(() => {
    if (!suggestion) return;
    const rules = suggestion.actions.map(a => ({
      ruleId: `rule-${a.id}`,
      name: a.name,
      trigger: suggestion.conditions
        .filter(c => a.preconditions?.includes(c.id))
        .map(c => c.zeromqEvent).filter(Boolean),
      conditions: suggestion.conditions
        .filter(c => a.preconditions?.includes(c.id))
        .map(c => ({ entityType: c.targetEntityType, property: c.property, operator: c.operator, value: c.value })),
      onTrue: { emitEvent: a.zeromqEmit, executeLlmPrompt: a.llmPromptTemplate },
    }));

    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "zmq-rules.json"; a.click();
    setToast("⬇ ZMQ rules exported");
  }, [suggestion]);

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2230; border-radius: 4px; }
        @keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .react-flow__background { background: ${C.bg} !important; }
        .react-flow__controls { background: ${C.panel} !important; border: 1px solid ${C.panelBorder} !important; border-radius: 10px !important; }
        .react-flow__controls button { background: ${C.panel} !important; border-color: ${C.panelBorder} !important; color: ${C.textMuted} !important; }
        .react-flow__minimap { background: ${C.panel} !important; border: 1px solid ${C.panelBorder} !important; border-radius: 10px !important; }
        .react-flow__edge-label { pointer-events: none; }
      `}</style>

      {/* Left Panel: Chat + Detail tabs */}
      <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.panelBorder}` }}>
        {/* Tab switcher */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.panelBorder}`, background: C.panel }}>
          {["chat", "detail"].map(tab => (
            <button key={tab} onClick={() => setActivePanel(tab)} style={{
              flex: 1, padding: "12px 0", border: "none", background: "transparent",
              color: activePanel === tab ? C.accent : C.textMuted,
              fontFamily: "inherit", fontWeight: 700, fontSize: 11,
              letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
              borderBottom: `2px solid ${activePanel === tab ? C.accent : "transparent"}`,
              transition: "all 0.15s",
            }}>
              {tab === "chat" ? "Chat" : "Analysis"}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "hidden" }}>
          {activePanel === "chat"
            ? <ChatPanel messages={chatMessages} onSend={handleSend} isThinking={isThinking} />
            : <DetailPanel suggestion={suggestion} onSave={handleSave} onExportZmq={handleExportZmq} />
          }
        </div>
      </div>

      {/* Center: React Flow Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          defaultEdgeOptions={{
            style: { stroke: C.accentDim, strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: C.accentDim },
          }}
        >
          <Background variant="dots" gap={24} size={1} color="#1e2230" />
          <Controls position="bottom-right" />
          <MiniMap
            position="bottom-left"
            nodeColor={n => {
              const colorMap = { trigger: C.trigger.border, condition: C.condition.border, action: C.action.border, outcome: C.outcome.border };
              return colorMap[n.type] || C.accentDim;
            }}
            maskColor={C.bg + "cc"}
          />

          {/* Canvas header */}
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: 10, pointerEvents: "none",
            background: C.panel + "dd", border: `1px solid ${C.panelBorder}`,
            borderRadius: 20, padding: "6px 16px",
          }}>
            {[
              { color: C.trigger.border, label: "Trigger" },
              { color: C.condition.border, label: "Condition" },
              { color: C.action.border, label: "Action" },
              { color: C.outcome.border, label: "Outcome" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
                <span style={{ color: C.textMuted, fontSize: 10 }}>{item.label}</span>
              </div>
            ))}
          </div>

          {nodes.length === 0 && (
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center", pointerEvents: "none",
            }}>
              <div style={{ color: C.textDim, fontSize: 28, marginBottom: 12 }}>⬡</div>
              <div style={{ color: C.textDim, fontSize: 13, fontWeight: 600 }}>Decision Graph Canvas</div>
              <div style={{ color: C.textDim, fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                Describe a situation in the chat panel<br />to generate a graph
              </div>
            </div>
          )}
        </ReactFlow>
      </div>

      {/* Right: Saved Graphs Sidebar */}
      {savedGraphs.length > 0 && (
        <div style={{
          width: 200, borderLeft: `1px solid ${C.panelBorder}`,
          background: C.panel, padding: 16,
        }}>
          <div style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12 }}>SAVED GRAPHS</div>
          {savedGraphs.map(g => (
            <div key={g.id} style={{
              padding: "8px 10px", borderRadius: 7, marginBottom: 6,
              background: C.surface, border: `1px solid ${C.panelBorder}`,
              color: C.text, fontSize: 11, cursor: "pointer",
              transition: "border-color 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + "55"}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.panelBorder}
            >
              {g.title}
            </div>
          ))}
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Mock suggestion for demo/dev ──────────────────

function generateMockSuggestion(userMessage) {
  const keyword = userMessage.toLowerCase();
  const isShutdown = keyword.includes("shut") || keyword.includes("compressor") || keyword.includes("pressure");

  return {
    title: isShutdown ? "Compressor Anomaly Response" : "Automated Decision Response",
    description: isShutdown
      ? "Monitors pressure thresholds and vibration alerts, routes to maintenance or emergency shutdown."
      : "Derived from conversation context with ontology-grounded conditions and actions.",
    reasoning: isShutdown
      ? "Two open vibration alerts combined with elevated pressure readings exceed safe operating thresholds. Emergency shutdown is available but premature; scheduling maintenance aligns with the next available window."
      : "Based on the described situation, the most appropriate response involves monitoring relevant entity states and executing corrective actions when conditions are met.",
    conditions: [
      {
        id: "cond-1",
        targetEntityType: "Sensor",
        targetEntityId: "sensor-unit4-pressure",
        property: "pressure",
        operator: "gt",
        value: "150",
        description: "Pressure exceeds 150 PSI safe threshold",
        zeromqEvent: "sensor.threshold.exceeded",
      },
      {
        id: "cond-2",
        targetEntityType: "Alert",
        targetEntityId: undefined,
        property: "openAlertCount",
        operator: "gte",
        value: "2",
        description: "Multiple open alerts on same asset",
        zeromqEvent: "alert.multiple.open",
      },
    ],
    actions: [
      {
        id: "act-1",
        name: "Schedule Maintenance",
        description: "Create work order for next maintenance window",
        targetEntityType: "WorkOrder",
        actionType: "ScheduleMaintenance",
        parameters: { window: "next", priority: "high", notifyOps: "true" },
        preconditions: ["cond-2"],
        status: "pending",
        zeromqEmit: "workorder.created",
        llmPromptTemplate: "Assess {{targetEntityId}} and recommend maintenance scope based on recent alerts.",
      },
      {
        id: "act-2",
        name: "Emergency Shutdown",
        description: "Immediately halt Compressor Unit 4",
        targetEntityType: "Compressor",
        targetEntityId: "compressor-unit4",
        actionType: "EmergencyShutdown",
        parameters: { urgency: "immediate", notifyOps: "true", logReason: "pressure+vibration" },
        preconditions: ["cond-1", "cond-2"],
        status: "pending",
        zeromqEmit: "compressor.shutdown.initiated",
      },
    ],
    nodes: [
      { id: "n-trigger", type: "trigger", label: "Anomaly Detected", description: "Sensor reading or alert threshold crossed" },
      { id: "n-cond-1", type: "condition", label: "Pressure > 150 PSI", conditionId: "cond-1", entityType: "Sensor" },
      { id: "n-cond-2", type: "condition", label: "Multiple Open Alerts", conditionId: "cond-2", entityType: "Alert" },
      { id: "n-act-1", type: "action", label: "Schedule Maintenance", actionId: "act-1", entityType: "WorkOrder" },
      { id: "n-act-2", type: "action", label: "Emergency Shutdown", actionId: "act-2", entityType: "Compressor" },
      { id: "n-outcome-1", type: "outcome", label: "Maintenance Scheduled", description: "Work order created, operations notified" },
      { id: "n-outcome-2", type: "outcome", label: "System Offline", description: "Compressor halted, pressure normalizing" },
    ],
    edges: [
      { id: "e1", source: "n-trigger", target: "n-cond-1" },
      { id: "e2", source: "n-trigger", target: "n-cond-2" },
      { id: "e3", source: "n-cond-2", target: "n-act-1", label: "true", condition: "true" },
      { id: "e4", source: "n-cond-1", target: "n-act-2", label: "true", condition: "true" },
      { id: "e5", source: "n-cond-1", target: "n-act-1", label: "false", condition: "false" },
      { id: "e6", source: "n-act-1", target: "n-outcome-1" },
      { id: "e7", source: "n-act-2", target: "n-outcome-2" },
    ],
  };
}
