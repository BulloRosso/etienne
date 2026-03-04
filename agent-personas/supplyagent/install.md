# SupplyAgent — Installation Guide

## Overview

SupplyAgent is an autonomous supply chain assistant for mid-sized manufacturers. It reads supplier emails, builds a living knowledge model of your supply chain, and warns you before problems get expensive.

## Prerequisites

Before installing SupplyAgent, ensure:

1. **Project exists** — Create a project in the workspace if you haven't already
2. **Required skills provisioned**:
   - `scrapbook` — for the knowledge graph structure
   - `schedule-task` — for cron job registration
   - `public-website` — for the dashboard
3. **Services running**:
   - Scrapbook service (rdf-store on port 7000)
   - Webserver (on port 4000) for the dashboard

## Installation

The installation is performed by the `agent-personas` skill. Simply ask your agent:

> "Install the SupplyAgent persona"

The skill will guide you through:

1. **Language selection** — Choose the language for reports, dashboard, and notifications
2. **Sub-agent creation** — 7 specialized sub-agents are created
3. **Cron job registration** — 6 recurring jobs are scheduled
4. **Knowledge graph seeding** — Scrapbook structure with 5 categories and 3 risk subcategories
5. **Dashboard generation** — Public website with supplier risk, order deadline, and activity views
6. **Reference file placement** — Ontology and governance files copied to project

## Post-Installation: Onboarding

After installation, say **"start onboarding"** to begin the guided setup process:

1. **Personality** — Name your agent, set the communication tone
2. **Materials** — Upload supplier lists, order history, and open orders
3. **Graph build** — Uploaded data is parsed and imported into the knowledge graph
4. **Cron configuration** — Review and confirm the proposed job schedule
5. **Expert knowledge** — Share what no document contains: seasonal patterns, supplier quirks, escalation preferences

## Verification Checklist

After installation, verify:

- [ ] 7 sub-agents visible in the Subagents configuration panel
- [ ] 6 scheduled tasks visible in the Scheduling overview
- [ ] Scrapbook shows "Supply Chain Knowledge Graph" with 5 categories
- [ ] Dashboard accessible at `/web/{project}/`
- [ ] Reference files present in `data/supplyagent/`

## Components

| Component | Count | Purpose |
|---|---|---|
| Sub-agents | 7 | Orchestrator + 6 specialized skills |
| Cron jobs | 6 | Weekly briefing, daily scan, bi-weekly radar, monthly risk, nightly maintenance |
| Scrapbook categories | 5 | Suppliers, Parts, Orders, Delivery Events, Risk Assessment |
| Risk subcategories | 3 | Single Source Risks, Urgent Orders, Declining Reliability |
| Dashboard panels | 4 | Supplier Risk, Order Deadlines, Activity Log, Quick Stats |
