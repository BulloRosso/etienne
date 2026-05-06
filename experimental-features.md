# Experimental features

## Agent Personas

<div align="center">
<img src="/docs/images/agent-personas.jpg" alt="Agent Personas" width="900">
</div>

The feature is all about testing a specific hypothesis:

> Can you go from a business requirement to a deployed, fully customized AI system — 
> without writing a single line of application code?

The answer, at least for a certain class of software, appears to be yes. Here's the five-step process we used:

* **Step 1 — Business Requirements Document** We sat down with the customer and wrote a concept document the way you'd write any product spec: what problem are we solving, for whom, what does the system do, what does it explicitly not do. Plain language. No code. The document also contained the marketing narrative, the pricing model, and a detailed technical architecture — written in prose, not pseudocode.

[Read the Document (.docx) here](/agent-personas/supplyagent-concept-en.docx)

* **Step 2 — Agentic OS Creates the Agent-Description-Package** We gave that document to a general-purpose AI agent — one that has been taught its own architecture: how RDF Knowledge Graphs work, what a RAG pipeline is, how SPARQL queries are structured, what cron governance means. Because the agent understands itself, it could read the concept document and generate a complete Agent-Description-Package (ADP): a ZIP file containing every artifact the final system would need:

* System prompts for each sub-agent. 
* Configuration files. 
* Governance rules. 
* An onboarding checklist. 
* A machine-readable MANIFEST.json with install order and integrity hashes. 

The agent specified itself.

* **Step 3 — Generic Agent Receives ADP and Transforms Itself** A separate instance of the general-purpose agent — no product knowledge, no pre-built application — receives the ZIP. It reads MANIFEST.json, validates the contents, and uses its own code generation and configuration capabilities to instantiate the system described in the ADP. This is not running an installer. This is an agent becoming what the specification describes. Self-adaptation from a description package. Note: Etienne is a integration harness around a coding harness like Claude Code or Codex - so it has extensive software implementation knowledge.

* **Step 4 — Onboarding: Agent Meets Customer** The newly instantiated agent begins its onboarding phase autonomously. It introduces itself, conducts a structured interview, and actively requests the materials it needs: supplier lists, order history, contracts, org charts, anything that will prime its knowledge systems. It doesn't stop until every item on the onboarding checklist — embedded in the ADP — is fulfilled. The checklist is the agent's own definition of "ready."

* **Step 5 — Work Cycle with Human-in-the-Loop** Once onboarded, the agent begins its operational cycle. It monitors, reasons, drafts, warns — and surfaces every consequential action to a human approval queue before acting. The human stays in control. The agent gets better with every correction.


## Decision Support Studio

<div align="center">
<img src="/docs/images/decision-support.jpg" alt="How decision support works" width="900">
</div>

Decision support is one of the most advanced features of Etienne. You must start the **Knowledge Graph and the Vector Store services** before you will be able to use it:

<div align="center">
<img src="/docs/images/service-control.jpg" alt="Service control drawer" width="900">
</div>

Additionally the **decision-support skill** needs to be activated on your project:

<div align="center">
<img src="/docs/images/decision-support-skill.jpg" alt="Decision Support Skill" width="700">
</div>

Then open the decision support studio window from the project menu:

<div align="center">
<img src="/docs/images/decision-support-studio-1.jpg" alt="Decision Support Studio" width="700">
</div>

Currently you have to add entity instances manually using "+ Add Entity":

<div align="center">
<img src="/docs/images/decision-support-studio-2.jpg" alt="Decision Support Studio" width="700">
</div>
