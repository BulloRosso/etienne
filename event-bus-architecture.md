## Event Bus Components — Integrated AI Agent Architecture

The Integrated AI Agent Architecture connects three existing systems through a shared ZeroMQ event bus,
enabling a **perceive → contextualize → decide → act → remember agent loop**.

| System | Role | Metaphor |
|--------|------|----------|
| **CMS** (Event-Handling) | Sensory Layer | Eyes & ears — perceives what's happening now |
| **DSS** (Ontology-Core) | Memory & Reasoning | Brain — stores knowledge, provides context |
| **SWE** (Stateful-Workflows) | Motor Layer | Hands — executes deliberate multi-step actions |
| **Agent Bus** | Nervous System | Connects all components via messages |

## Architecture Diagram

```mermaid
graph TB
    subgraph "External Event Sources"
        IMAP[Email / IMAP]
        MQTT[MQTT Devices]
        WH[Webhooks]
        FS[File System]
        TIMER[Schedulers]
    end

    subgraph "CMS — Condition Monitoring System"
        ER[EventRouterService]
        RE[RuleEngineService]
        RAE[RuleActionExecutorService]
    end

    subgraph "Agent Bus"
        EB[EventBusService<br/>ZeroMQ PUB/SUB]
        IR[IntentRouterService]
        DQA[DssQueryAdapterService]
        CI[ContextInjectorService]
        BL[BusLoggerService]
    end

    subgraph "DSS — Decision Support System"
        DSS[DecisionSupportService]
        KG[KnowledgeGraphService<br/>Quadstore RDF]
        VS[VectorStoreService<br/>ChromaDB]
    end

    subgraph "SWE — Stateful Workflow Engine"
        SWS[StatefulWorkflowsService<br/>XState v5]
        WEA[WorkflowEntryActionService]
    end

    IMAP & MQTT & WH & FS & TIMER --> ER
    ER -->|"events/raw/*"| EB
    ER --> RE
    RE -->|rule matched| RAE
    RAE -->|"agent/intent"| EB
    RAE -->|"prompt action"| LLM[Claude LLM]
    RAE -->|"workflow_event"| SWS

    EB -->|"agent/intent"| IR
    IR -->|"workflow/trigger"| EB
    EB -->|"workflow/trigger"| SWS
    SWS -->|"workflow/status/*"| EB
    SWS --> WEA
    WEA -->|prompt/script| LLM

    DQA --> DSS
    CI --> DQA
    RAE -.->|enrich| CI
    WEA -.->|context| CI

    DSS --> KG
    DSS --> VS
    EB -->|"dss/update"| DSS
    EB -->|"dss/query"| DQA

    EB --> BL

    style EB fill:#f9a825,stroke:#f57f17,color:#000
    style BL fill:#e8f5e9,stroke:#43a047
```
[More info...](/backend/src/agent-bus/EVENT_BUS_COMPONENTS.md)
