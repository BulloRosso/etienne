[← back to README](../README.md)

# Skills: Lifecycle, Guarantees, and the Skills Store

This document expands on Etienne's skill system — how skills evolve from creation to continuous improvement, the guarantees the lifecycle delivers, and the enterprise-grade management surface around it. For the high-level introduction (what a skill is and why it matters), see the [Built around Skills](../README.md#built-around-skills) section in the root README.

## A Real Lifecycle: From Creation to Continuous Improvement

This is where things get exciting. Let me walk you through how this works in practice with Etienne:

<div align="center">
<img src="/docs/images/skills-4.jpg" alt="How Skills evolve" width="800">
</div>

### Step 1 — The IT Admin Builds or Selects a Skill
An administrator curates skills — either building them from scratch with domain experts or selecting proven ones from a shared repository. Every skill is security-checked and technology-approved before it enters the company's skill store.

<div align="center">
<img src="/docs/images/skills-5.jpg" alt="Etienne internal Skill Store" width="900">
</div>

### Step 2 — The User Picks What They Need
Business users browse the approved skill catalog and select the ones relevant to their current project. The skill is copied into their project directory. No installation headaches. No waiting on IT tickets. Self-service, but with guardrails.

<div align="center">
<img src="/docs/images/skills-6.jpg" alt="Selecting the Skills when creating a new Project" width="900">
</div>

### Step 3 — The Agent Uses the Skill
From this point on, the agent automatically applies the skill whenever the user's task calls for it. The user focuses on their work; the agent handles the expertise-to-technology translation behind the scenes.

### Step 4 — The Skill Evolves Through Use
Here's where the magic happens: as the agent works within a project, it can refine and improve the skill based on real-world usage. A generic "financial report analysis" skill might become a finely tuned "Q3 EMEA margin analysis" skill — adapted to the user's actual needs. At this point, it truly becomes the user's skill.

<div align="center">
<img src="/docs/images/skills-7.jpg" alt="Modified Skills can be reset or sent for review to the administrator" width="900">
</div>

### Step 5 — The Best Improvements Flow Back
When a user discovers that their refined skill is significantly better, they can submit it back to the IT administrator. The admin reviews the changes, validates them, updates the central repository — and suddenly, every team in the organization can benefit from one user's practical discovery.

**This is agentic learning with human supervision at its best.**

## Why This Matters: Five Guarantees That Change Everything
Let's be clear about what this lifecycle delivers:

* **Understandable**. Skills are expressed in markdown. Not in opaque model weights. Not in mysterious embeddings. In plain language that any business stakeholder can read, review, and challenge. When your compliance team asks "what does the AI actually do?" — you hand them the skill file.
* **Battle-tested**. Every improvement comes from a real user solving a real problem in a real project. This isn't theoretical optimization. It's field-proven refinement.
* **Intentional**. Skill updates don't happen silently in the background. A user consciously decides to submit an improvement. A human makes the choice.
* **Reviewed**. The four-eyes principle applies. An admin reviews every submitted change before it enters the repository. No unvetted modifications reach other users.
* **Safe to deploy**. Updated skills don't retroactively change existing results in a user's project. The rollout is safe because users must opt-in to updates through their project settings. Think of it as software updates — only on a higher abstraction level.

## The Skills Store: Enterprise-Grade Management
Behind the scenes, administrators have access to a Skills Store — a management interface where they oversee the entire skill portfolio. Each skill carries rich metadata that goes beyond the open standard, allowing companies to define their own strategies for evolving, versioning, and distributing skills across the organization.

<div align="center">
<img src="/docs/images/skills-8.jpg" alt="Adminstrator defines dependencies" width="900">
</div>

Etienne also adds practical extensions to the formal standard that business environments demand:

* **Technical dependencies** — a clear list of system requirements (npm packages, Python libraries, or other artifacts) that must be present on the agent's host system. No guesswork about what needs to be installed.
* **Environment variables** — explicit declarations of which API keys, tokens, or configuration values the skill needs. After installing a skill, a user can securely provide their personal credentials scoped exclusively to their project.

This means IT knows exactly what a skill requires before deployment, and users maintain control over their own credentials and configurations.
