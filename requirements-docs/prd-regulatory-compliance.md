# Compliance Release Guideline

**AI-Assisted Development with Git-Based Documentation**

| Field | Value |
|---|---|
| Scope | Claude Agent SDK workspace projects |
| Version Control | Git with tagged releases |
| Requirements Source | `CLAUDE.md` per project |
| Version | 1.0 |

---

## 1. Overview

This guideline defines how a human user documents and releases artifacts produced during AI-assisted development. The process is designed to be lightweight while satisfying regulatory compliance requirements for traceability, human oversight, and change control.

The workflow leverages three things you already have: **`CLAUDE.md`** as the requirements specification, **git** as the immutable version control layer, and **saved chat sessions** as the AI interaction audit trail.

---

## 2. Applicable Standards and Regulations

This workflow is designed to satisfy documentation and change control requirements across multiple compliance frameworks. The table below maps each framework to the specific clauses this guideline addresses.

| Standard / Regulation | Relevant Clause | What It Requires |
|---|---|---|
| **EU AI Act** (Regulation 2024/1689) | Art. 11, Annex IV | Technical documentation before deployment; kept up-to-date; demonstrating compliance with requirements. Must include design specifications, development process description, and change records. |
| **EU AI Act** | Art. 14 | Human oversight measures — the ability for humans to understand, monitor, and intervene in AI system outputs. |
| **EU AI Act** | Art. 72 | Post-market monitoring plan — ongoing documentation of system behavior and changes after deployment. |
| **ISO/IEC 42001:2023** (AI Management System) | Clause 8.2 | Operational controls for AI risk treatment must be implemented and documented. |
| **ISO/IEC 42001:2023** | Clause 9.1–9.3 | Performance evaluation — monitoring, measurement, analysis, internal audit, and management review of AI systems. |
| **ISO/IEC 42001:2023** | Annex A | Reference controls requiring accountability, transparency, traceability, and explainability of AI systems. |
| **ISO/IEC 42001:2023** | Annex C | AI-related objectives including maintainability, transparency, and explainability. |
| **ISO 27001:2022** | Annex A 8.32 | Change management — all changes must be risk-assessed, authorized, documented, and include fallback procedures. Requires maintaining records of all alterations. |
| **ISO 27001:2022** | Clause 7.5 | Documented information — creation, updating, and control of documents required by the ISMS. |
| **ISO 9001:2015** | Clause 8.5.6 | Control of changes — review and control of unplanned changes to production, with documented records. |
| **SOC 2** (AICPA TSC) | CC8.1 | Changes to infrastructure, data, software, and procedures are authorized, designed, developed, configured, documented, tested, approved, and implemented. |
| **NIST AI RMF 1.0** | GOVERN, MAP, MANAGE | Governance and documentation of AI system lifecycle, including human oversight, risk identification, and change tracking. |

> **Note:** Not all standards will apply to every organization. Identify which frameworks are relevant to your regulatory context and use this guideline as a foundation. The workflow is intentionally structured so that each artifact maps cleanly to multiple frameworks.

---

## 3. Key Concepts

**`CLAUDE.md`** — The central project memory file. Serves as the requirements specification and living documentation of the project's intent, constraints, and decisions. This satisfies the technical documentation requirements of EU AI Act Annex IV (design specifications, intended purpose) and ISO/IEC 42001 Clause 8.2 (documented operational controls).

**Git Repository** — Each project directory is git-tracked. Commits serve as immutable checkpoints of all project artifacts. Git tags create addressable, verifiable release points. This satisfies ISO 27001 A.8.32's requirement for documented, traceable change records and SOC 2 CC8.1's requirement for authorized, documented changes.

**Initial Release (v1.0)** — The first tagged git commit representing a complete, reviewed deliverable. Establishes the compliance baseline.

**Update Release (v1.x+)** — Subsequent tagged commits. Each includes a diff protocol documenting what changed and human annotations explaining why. This directly addresses ISO 27001 A.8.32's nine-component change management procedure.

**Chat Sessions** — Saved conversation logs from Claude Agent SDK. These provide the full audit trail of AI interaction, satisfying EU AI Act Art. 14 (human oversight evidence) and ISO/IEC 42001 Annex A controls for transparency and explainability.

---

## 4. Artifact Map

| Stage | Artifact | Compliance Function | Standards Addressed |
|---|---|---|---|
| During Development | Chat sessions (auto-saved) | Audit trail, AI interaction log | EU AI Act Art. 14; ISO 42001 Annex A (transparency) |
| During Development | `CLAUDE.md` (continuously updated) | Requirements specification | EU AI Act Annex IV; ISO 42001 Clause 8.2 |
| During Development | Project files (code, docs) | Deliverables | ISO 9001 Clause 8.5 |
| At Release | Git tag (v1.0, v1.1, …) | Immutable checkpoint | ISO 27001 A.8.32; SOC 2 CC8.1 |
| At Release | `RELEASE_NOTES.md` | Human review record | EU AI Act Art. 14; ISO 42001 Clause 9 |
| At Update Release | `CHANGELOG.md` (cumulative) | Change control log | ISO 27001 A.8.32; SOC 2 CC8.1 |
| At Update Release | `DIFF_PROTOCOL_vX.Y.md` | Annotated change traceability | ISO 27001 A.8.32; EU AI Act Art. 11 |

---

## 5. Procedure A — Initial Release (v1.0)

Perform these steps when the project reaches its first complete, reviewable state. This establishes the compliance baseline.

> **Trigger:** The project deliverables are functionally complete and ready for first human review.


### Step 1: Freeze `CLAUDE.md` as Requirements Baseline

Review the `CLAUDE.md` file in your project directory. This file has been serving as the project's living memory and now becomes the formal requirements specification for this release.

**Action:** Open `CLAUDE.md`. Verify it accurately reflects the project intent, constraints, and acceptance criteria. Add any missing requirements.

Add a section header at the top or bottom:

```markdown
## Requirements Baseline — v1.0
Date: YYYY-MM-DD
```

Ensure the document covers:

- All functional requirements
- All constraints and non-functional requirements
- The intended purpose and scope of the AI-generated output (per EU AI Act Annex IV §1)
- Any design decisions or trade-offs made during development (per EU AI Act Annex IV §2(b))

> **ISO/IEC 42001 note:** This step satisfies Clause 8.2 by documenting the operational controls and objectives for the AI system. It also supports Annex C objectives of transparency and explainability.


### Step 2: Review All Project Deliverables

Manually inspect every file that Claude produced. This is the core **human oversight** step.

**Action:** Open and read each generated file. Verify correctness, completeness, and fitness for purpose.

Review checklist:

- **Code files:** Review logic, test coverage, security implications
- **Documents:** Review accuracy, completeness, formatting
- **Configuration:** Review settings, credentials, environment-specific values
- **All files:** Verify no unintended content, hallucinated references, or security issues

Fix or request fixes for anything that does not meet your requirements.

> **EU AI Act note:** Art. 14 requires that AI systems be designed to allow effective human oversight, including the ability to correctly interpret output and to decide not to use it. This step is your documented evidence of that oversight.

> **ISO 27001 note:** A.8.32 requires that changes (including initial deployments) are tested and reviewed before implementation. This review constitutes your pre-deployment validation.


### Step 3: Create `RELEASE_NOTES.md`

Create a release notes file that serves as your formal sign-off document.

**Action:** Create the file `RELEASE_NOTES.md` in the project root with the following structure:

```markdown
# Release Notes — v1.0

## Date
YYYY-MM-DD

## Reviewer
[Your Full Name]

## Role
[Your role/title — establishes authorization per ISO 27001 A.8.32]

## Summary
[1–2 sentence description of what was built]

## AI System Used
- Model: [e.g., Claude Sonnet 4.5 via Claude Agent SDK]
- Date range of development: [start] – [end]

## Requirements Reference
CLAUDE.md (baseline v1.0)

## Review Scope
[List the types of files reviewed: code, documentation, configuration, etc.]

## Review Outcome
APPROVED / APPROVED WITH NOTES

## Known Limitations
[Any caveats, known issues, or areas where AI output required correction]

## Risk Assessment
[Brief assessment of risks — required by ISO 42001 Clause 8.2 and ISO 27001 A.8.32]

## Notes
[Any additional observations]
```

> **SOC 2 note:** CC8.1 requires that changes are "authorized, designed, developed, configured, documented, tested, approved, and implemented." This file documents the authorization and approval steps.


### Step 4: Stage and Commit Everything

Create the immutable compliance checkpoint.

**Action:** Run the following git commands from the project directory:

```bash
git add -A
git commit -m "Release v1.0 — Initial compliant release"
```

> **ISO 27001 note:** A.8.32 requires "maintaining records of all alterations." The git commit creates a cryptographically verifiable record with timestamp, author, and complete file state.


### Step 5: Tag the Release

The git tag creates an addressable, immutable reference point.

```bash
git tag -a v1.0 -m "Initial release — reviewed and approved by [Your Name]"
```

> **Tip:** Use annotated tags (`-a`) rather than lightweight tags. Annotated tags store the tagger name, date, and message, which provides stronger audit evidence.


### Step 6: Archive Chat Sessions

Ensure all chat sessions from the development phase are saved within the project scope.

**Action:** Verify that all relevant Claude chat sessions are retained in the project. These serve as the AI interaction audit trail.

> **EU AI Act note:** Art. 12 requires that high-risk AI systems support automatic recording of events (logs). While your system may not be classified as high-risk, maintaining chat logs demonstrates best practice and satisfies the spirit of the regulation. ISO/IEC 42001 Annex A similarly expects traceability and audit logs.


### ✓ v1.0 Release Complete

The compliance record now consists of:

| Artifact | Compliance Function |
|---|---|
| `CLAUDE.md` | Requirements specification (EU AI Act Annex IV, ISO 42001 Clause 8.2) |
| `RELEASE_NOTES.md` | Human approval record (EU AI Act Art. 14, SOC 2 CC8.1) |
| Git tag `v1.0` | Immutable snapshot (ISO 27001 A.8.32) |
| Chat sessions | AI interaction audit trail (ISO 42001 Annex A, EU AI Act Art. 12) |

---

## 6. Procedure B — Update Release (v1.1, v1.2, …)

Perform these steps for every subsequent release after v1.0. The key addition is the **diff protocol with human annotations**, which documents what changed and why.

> **Trigger:** Changes have been made to the project since the last tagged release and a new checkpoint is needed.


### Step 1: Update `CLAUDE.md` If Requirements Changed

If the scope, constraints, or requirements evolved since the last release, update `CLAUDE.md` to reflect the current state.

**Action:** Review `CLAUDE.md`. Add or modify requirements as needed. Mark changed sections with the new version number.

```markdown
## Requirements Update — v1.1
Date: YYYY-MM-DD
Changes: [brief description of what changed in the requirements]
```

> **EU AI Act note:** Art. 11 requires that technical documentation "shall be kept up to date." This step ensures your requirements specification tracks the evolution of the system.


### Step 2: Generate the Diff Protocol

Create a human-readable record of all changes since the last release.

**Action:** Run the following commands to generate the diff against the last release tag:

```bash
# Create the diff protocol file with a stat summary and full diff
echo "# Diff Protocol — v1.0 → v1.1" > DIFF_PROTOCOL_v1.1.md
echo "" >> DIFF_PROTOCOL_v1.1.md
echo "## File Change Summary" >> DIFF_PROTOCOL_v1.1.md
echo '```' >> DIFF_PROTOCOL_v1.1.md
git diff v1.0 --stat >> DIFF_PROTOCOL_v1.1.md
echo '```' >> DIFF_PROTOCOL_v1.1.md
echo "" >> DIFF_PROTOCOL_v1.1.md
echo "---" >> DIFF_PROTOCOL_v1.1.md
echo "" >> DIFF_PROTOCOL_v1.1.md
echo "## Full Diff" >> DIFF_PROTOCOL_v1.1.md
echo '```diff' >> DIFF_PROTOCOL_v1.1.md
git diff v1.0 >> DIFF_PROTOCOL_v1.1.md
echo '```' >> DIFF_PROTOCOL_v1.1.md
```

Replace `v1.0` with the previous release tag (e.g., `v1.1` when releasing `v1.2`).

> **ISO 27001 note:** A.8.32 requires organizations to "map out and assess the potential effect of proposed modifications, considering all dependencies." The stat summary shows the scope of change; the full diff shows the detail.


### Step 3: Annotate the Diff Protocol

This is the critical **human oversight** step for update releases. You must add your annotations explaining each significant change.

**Action:** Open `DIFF_PROTOCOL_v1.1.md` and **prepend** an annotation header before the generated content:

```markdown
# Diff Protocol — v1.0 → v1.1

## Metadata
- Date: YYYY-MM-DD
- Reviewer: [Your Full Name]
- Role: [Your role/title]
- Previous Release: v1.0 (YYYY-MM-DD)

## Change Summary

| File / Area | What Changed | Why | Risk Level |
|---|---|---|---|
| [file or component] | [description of change] | [reason / business justification] | Low / Medium / High |
| [file or component] | [description of change] | [reason / business justification] | Low / Medium / High |

## Review Outcome
APPROVED / APPROVED WITH NOTES / REJECTED

## Risk Assessment
[Assessment of new risks introduced by changes. Note any rollback considerations.]

## Fallback Plan
[How to revert if issues are discovered — e.g., "git checkout v1.0"]

---
[git diff output below]
```

> **ISO 27001 note:** A.8.32 explicitly requires: (1) impact assessment, (2) authorization controls, (3) documentation, (4) notification to relevant parties, (5) testing/acceptance, (6) implementation plan, (7) emergency/fallback procedures, and (8) records of all the above. This annotation template covers all nine components.

> **SOC 2 note:** The "Why" column in the change summary directly satisfies CC8.1's requirement that changes are "designed" and "authorized" — it demonstrates intentionality rather than accidental drift.


### Step 4: Update `CHANGELOG.md` (Cumulative)

Maintain a running changelog across all releases. This format follows [Keep a Changelog](https://keepachangelog.com/) conventions.

**Action:** Add a new entry at the top of `CHANGELOG.md` (create it if it doesn't exist):

```markdown
# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [v1.1] — YYYY-MM-DD

### Changed
- [description of change]

### Added
- [description of addition]

### Fixed
- [description of fix]

### Removed
- [description of removal]

### Reviewer
[Your Full Name]

### AI Interaction
- New chat sessions: [count or date range]
- Model used: [e.g., Claude Sonnet 4.5]

---

## [v1.0] — YYYY-MM-DD
Initial release. See RELEASE_NOTES.md.
```

> **ISO/IEC 42001 note:** Clause 10.1 requires continual improvement. A cumulative changelog demonstrates that the organization is actively monitoring and improving its AI-assisted outputs over time.


### Step 5: Review Deliverables, Commit, and Tag

Review all changed deliverables, then create the new immutable checkpoint.

**Action:**

```bash
# Review changed files
git diff v1.0 --name-only    # see what files changed

# After review, commit and tag
git add -A
git commit -m "Release v1.1 — [brief description]"
git tag -a v1.1 -m "Update release — reviewed by [Your Name]"
```

> **Tip:** Always review the output of `git diff --name-only` before committing. This is your final verification that only intended changes are included.


### Step 6: Archive New Chat Sessions

Ensure any new chat sessions from this development cycle are retained in the project.


### ✓ Update Release Complete

The compliance record now adds:

| New Artifact | Compliance Function |
|---|---|
| `DIFF_PROTOCOL_v1.1.md` | Annotated change record (ISO 27001 A.8.32, EU AI Act Art. 11) |
| Updated `CHANGELOG.md` | Cumulative change log (ISO 42001 Clause 10.1, SOC 2 CC8.1) |
| Git tag `v1.1` | Immutable snapshot (ISO 27001 A.8.32) |
| Updated `CLAUDE.md` (if applicable) | Updated requirements (EU AI Act Art. 11) |
| New chat sessions | Extended audit trail (ISO 42001 Annex A) |

---

## 7. Quick Reference Checklist

### Initial Release (v1.0)

- [ ] `CLAUDE.md` reviewed and baselined with date and version
- [ ] All deliverables manually reviewed by human
- [ ] `RELEASE_NOTES.md` created with reviewer name, role, and approval
- [ ] Risk assessment documented
- [ ] All files committed: `git add -A && git commit`
- [ ] Release tagged: `git tag -a v1.0`
- [ ] Chat sessions archived in project

### Update Release (v1.x)

- [ ] `CLAUDE.md` updated if requirements changed
- [ ] Diff protocol generated: `git diff [previous-tag]`
- [ ] Diff protocol annotated with change reasons, risk levels, and reviewer sign-off
- [ ] Fallback plan documented
- [ ] `CHANGELOG.md` updated with cumulative entry
- [ ] All changed deliverables reviewed by human
- [ ] All files committed and tagged
- [ ] New chat sessions archived in project

---

## 8. Expected Project File Structure

```
project-root/
├── CLAUDE.md                        ← Requirements specification
├── RELEASE_NOTES.md                 ← Initial release sign-off
├── CHANGELOG.md                     ← Cumulative change log
├── DIFF_PROTOCOL_v1.1.md           ← Annotated diff (one per update)
├── DIFF_PROTOCOL_v1.2.md           ← Annotated diff (one per update)
├── [project files...]               ← Deliverables (code, docs, config)
└── .git/                            ← Version history + tags
```

---

## 9. Compliance Mapping Summary

| Compliance Requirement | Artifact(s) | How It's Met |
|---|---|---|
| **Traceability** | Chat sessions + git history | Every AI interaction and code change is recorded with timestamps and authorship |
| **Human Oversight** | `RELEASE_NOTES.md` + diff annotations | Explicit human review and sign-off at every release point |
| **Requirements Documentation** | `CLAUDE.md` | Living spec baselined and versioned at each release |
| **Change Control** | `CHANGELOG.md` + diff protocols | What changed, why, risk assessment, and who approved it |
| **Reproducibility** | Git tags | Any release can be fully reconstructed from the tagged commit |
| **Audit Trail** | All of the above | Complete chain from requirement to AI interaction to delivery to approval |
| **Risk Management** | `RELEASE_NOTES.md` + diff annotations | Risk assessment documented at initial and every update release |
| **Fallback / Rollback** | Git tags + diff protocol | Any previous version can be restored; rollback plan documented per release |

---

## 10. Standards Quick Reference

| Standard | Full Name | Relevance |
|---|---|---|
| **EU AI Act** | Regulation (EU) 2024/1689 | EU regulation for AI systems — documentation, human oversight, post-market monitoring. Applicable from Aug 2025 (GPAI) and Aug 2026 (high-risk). |
| **ISO/IEC 42001:2023** | AI Management System | International standard for responsible AI governance — risk management, operational controls, performance evaluation. Voluntary but increasingly expected. |
| **ISO 27001:2022** | Information Security Management | Change management (A.8.32), documented information control (7.5), audit trails. Mandatory for many regulated industries. |
| **ISO 9001:2015** | Quality Management | Control of changes (8.5.6), documented information, continual improvement. |
| **SOC 2** | Service Organization Controls | Trust service criteria for security, availability, and processing integrity — requires authorized, documented, tested changes (CC8.1). |
| **NIST AI RMF 1.0** | AI Risk Management Framework | US framework for AI governance — covers governance, risk mapping, measurement, and management across the AI lifecycle. |

---

*This guideline should be reviewed and updated as regulatory requirements evolve. Last updated: 2026-02-12.*