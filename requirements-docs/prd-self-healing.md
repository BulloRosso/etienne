# Self-healing Capabilities

Because we're building on a coding agent (which is hidden inside the Agent SDK) we can easily self-patch Etienne's backend and the services.

We need to make use of the RBAC system: the user can only report self-patching activities, but the agent never executes them. The agent analyzes the problem in planning mode together with the user and then creates a detailled issue for review by the admin.

The admin reviews each issue and accepts or rejects the self-patching process.

Issue management functions must be created in the project API in the backend.

## Skill in Skill-Repository

We need a new optional skill "self-healing" which can be actiated and then tells the user about the options.

The skill prepares an complete issue report to report in the backend and get's information from the customer to fill in all required fields. The skill can automatically create an issue using the projects API.

## Frontend

In the frontend we have a new tile "Issues" in the project menu which is accessible for admin and user role, but hidden for guest role.

The issues menu item brings a new modal dialog showing the new component "IssueManager.tsx". Here we have 3 tabs: "Open Issues","Report Issue", "History"

The skill helps the user to see the required fields in "Report Issue", but the user must explicitely send the report to the admin.

## Implement this strategy

Überblick: Der Issue-gesteuerte Healing-Loop

  ┌──────────┐     meldet Issue      ┌──────────────┐
  │   USER   │ ──────────────────────→│  ISSUES DB   │
  └──────────┘                        │  (Priority,  │
                                      │   Status,    │
                                      │   Details)   │
                                      └──────┬───────┘
                                             │
                                      ┌──────▼───────┐
                                      │    ADMIN      │
                                      │  Reviews &    │
                                      │  Approves     │
                                      └──────┬───────┘
                                             │ genehmigt
                                      ┌──────▼───────┐
                                      │ CLAUDE AGENT  │
                                      │ (Opus 4.5)   │
                                      │              │
                                      │ 1. Diagnose  │
                                      │ 2. Plan      │
                                      │ 3. Patch     │
                                      │ 4. Verify    │
                                      └──────┬───────┘
                                             │
                                      ┌──────▼───────┐
                                      │  PROCESS MGR  │
                                      │  (NestJS)     │
                                      │              │
                                      │  Restart      │
                                      │  betroffener  │
                                      │  Service      │
                                      └──────────────┘
Rollen und Berechtigungen
User (Melder)

Kann Issues erstellen mit Titel, Beschreibung und Reproduktionsschritten
Kann eigene Issues einsehen und kommentieren
Kann den Status seiner Issues verfolgen
Kann Issues nicht genehmigen, ablehnen oder priorisieren
Sieht: eigene Issues + deren Verlauf

Admin (Entscheider)

Sieht alle Issues aller User
Kann Priorität und Severity anpassen
Kann Issues genehmigen → Agent startet Diagnose + Repair
Kann Issues ablehnen → Issue wird geschlossen mit Begründung
Kann den Autonomie-Level des Agents konfigurieren
Sieht: vollständigen Audit Trail aller Agent-Aktionen
Kann Patches reviewen, bevor sie angewendet werden (bei hohem Risiko)
Kann Agent-Aktionen jederzeit abbrechen

NestJS-Modulstruktur
Die Architektur besteht aus fünf NestJS-Modulen:
IssueModule — Verwaltet den gesamten Issue-Lifecycle. REST-API für User (POST /issues, GET /issues/:id) und Admin (PATCH /issues/:id/approve, PATCH /issues/:id/reject, PATCH /issues/:id/priority). Persistiert Issues in einer eingebetteten Datenbank (SQLite oder JSON-File). Emittiert Events bei Statuswechseln (EventEmitter2).
DiagnosticModule — Lauscht auf issue.approved-Events. Spawnt eine Claude Agent SDK-Session im Read-Only-Modus. Der Agent analysiert Quellcode, Logs und Konfiguration der betroffenen Services über die Built-in-Tools (Bash, Read, Grep, Glob). Ergebnis: strukturierte Diagnose mit Root Cause, Confidence Score und betroffenen Dateien.
PatchModule — Nimmt die Diagnose entgegen und spawnt eine zweite Claude Agent SDK-Session mit Write-Zugriff (Edit, Write, MultiEdit). Der Agent erstellt einen Code-Patch. Bei kritischen Änderungen wird der Patch dem Admin zur Review vorgelegt, bevor er angewendet wird. Erstellt vor jeder Änderung ein Backup (Snapshot) der betroffenen Dateien.
VerificationModule — Prüft nach dem Patch, ob das Problem gelöst ist: führt Health Checks aus, testet betroffene Endpoints, prüft Logs auf neue Fehler. Bei Fehlschlag: automatischer Rollback auf den Snapshot.
ProcessManagerModule — Euer bestehender integrierter Process Manager. Wird vom PatchModule aufgerufen, um betroffene Services nach dem Patching neu zu starten.
Das Issue-Datenmodell
typescriptinterface SelfHealingIssue {
  // Identifikation
  id: string;                          // UUID
  number: number;                      // Fortlaufende Nummer (wie GitHub #42)
  title: string;                       // Kurzbeschreibung vom User

  // Vom User geliefert
  description: string;                 // Was ist das Problem?
  stepsToReproduce?: string;           // Wie kann man es nachstellen?
  expectedBehavior?: string;           // Was sollte passieren?
  actualBehavior?: string;             // Was passiert stattdessen?
  reportedBy: string;                  // User ID

  // Vom Admin gesetzt
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  approvedBy?: string;                 // Admin ID
  approvedAt?: Date;
  rejectionReason?: string;

  // Status-Lifecycle
  status:
    | 'OPEN'               // User hat gemeldet, wartet auf Admin
    | 'APPROVED'           // Admin hat genehmigt, Agent startet
    | 'REJECTED'           // Admin hat abgelehnt
    | 'DIAGNOSING'         // Agent analysiert das Problem
    | 'DIAGNOSED'          // Root Cause gefunden
    | 'PATCH_PENDING'      // Patch erstellt, wartet auf Review (bei hohem Risiko)
    | 'PATCHING'           // Patch wird angewendet
    | 'VERIFYING'          // Post-Patch-Prüfung läuft
    | 'RESOLVED'           // Fix verifiziert, Issue geschlossen
    | 'FAILED'             // Patch fehlgeschlagen, Rollback durchgeführt
    | 'ESCALATED';         // Agent kann nicht lösen, manuelle Intervention nötig

  // Vom Agent gefüllt (Diagnose)
  rootCause?: string;                  // Natürlichsprachige Erklärung
  affectedFiles?: string[];            // Welche Dateien sind betroffen
  affectedServices?: string[];         // Welche Services sind betroffen
  confidenceScore?: number;            // 0.0–1.0 (Wie sicher ist die Diagnose)
  diagnosticLog?: string;              // Vollständiges Agent-Protokoll

  // Vom Agent gefüllt (Patch)
  patchDiff?: string;                  // Der Code-Patch als Diff
  patchRationale?: string;             // Warum dieser Fix?
  filesModified?: FileSnapshot[];      // Backup der Originaldateien
  servicesRestarted?: string[];        // Welche Services neu gestartet

  // Verifikation
  verificationResult?: 'PASS' | 'FAIL';
  verificationDetails?: string;
  rolledBack?: boolean;

  // Zeitstempel
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  timeToResolve?: number;              // Millisekunden von APPROVED bis RESOLVED

  // Beziehungen
  comments: IssueComment[];            // User + Admin Kommentare
  relatedIssueIds: string[];
}

interface IssueComment {
  id: string;
  author: string;                      // User ID oder 'SYSTEM' oder 'AGENT'
  role: 'USER' | 'ADMIN' | 'AGENT';
  content: string;
  createdAt: Date;
}

interface FileSnapshot {
  filePath: string;
  originalContent: string;
  patchedContent: string;
  snapshotAt: Date;
}
Status-State-Machine
  USER meldet
       │
       ▼
     OPEN ───────────────────── REJECTED (Admin lehnt ab)
       │
       │ Admin genehmigt
       ▼
   APPROVED
       │
       ▼
  DIAGNOSING
       │
       ├── Agent kann nicht diagnostizieren → ESCALATED
       │
       ▼
  DIAGNOSED
       │
       ├── Hoher Risk-Score → PATCH_PENDING (Admin Review)
       │                          │
       │                          ▼ Admin genehmigt Patch
       ▼
   PATCHING
       │
       ▼
  VERIFYING
       │
       ├── Verifikation bestanden → RESOLVED
       │
       └── Verifikation fehlgeschlagen → FAILED (auto-rollback)
                                            │
                                            └── → ESCALATED
Claude Agent SDK Integration
Das Agent SDK wird in zwei getrennten Modi eingesetzt — einmal zur Diagnose (Read-Only), einmal zum Patching (Write-Access):
typescriptimport { Claude } from '@anthropic-ai/claude-agent-sdk';

// === DIAGNOSE-AGENT (Read-Only) ===
async function diagnoseIssue(issue: SelfHealingIssue): Promise<Diagnosis> {
  const agent = new Claude({
    model: 'claude-opus-4-5',
    maxTurns: 30,
    allowedTools: ['Bash', 'Read', 'Grep', 'Glob', 'Task'],
    permissionMode: 'allowRead',  // Kein Schreibzugriff
    systemPrompt: `Du bist ein Diagnose-Agent innerhalb eines Docker-Containers.
      Deine Aufgabe: Finde die Root Cause des folgenden Problems.

      KONTEXT:
      - NestJS-Orchestrator unter /app/nest/
      - Python-Services unter /app/services/
      - Logs unter /app/logs/
      - Config unter /app/config/

      REGELN:
      - Nutze Grep und Read um Quellcode und Logs zu durchsuchen
      - Nutze Bash für Laufzeit-Diagnostik (z.B. Netzwerk, Disk, Prozesse)
      - Nutze Task für parallele Untersuchungen
      - Gib am Ende eine strukturierte Diagnose zurück:
        ROOT_CAUSE: <Erklärung>
        CONFIDENCE: <0.0-1.0>
        AFFECTED_FILES: <Liste>
        AFFECTED_SERVICES: <Liste>
        SUGGESTED_FIX: <Beschreibung des Fixes>`
  });

  const result = await agent.run(
    `Untersuche folgendes Problem:
     Titel: ${issue.title}
     Beschreibung: ${issue.description}
     Reproduktionsschritte: ${issue.stepsToReproduce}
     Erwartetes Verhalten: ${issue.expectedBehavior}
     Tatsächliches Verhalten: ${issue.actualBehavior}`
  );

  return parseDiagnosis(result);
}

// === PATCH-AGENT (Write-Access mit Guardrails) ===
async function patchIssue(issue: SelfHealingIssue, diagnosis: Diagnosis): Promise<PatchResult> {
  const agent = new Claude({
    model: 'claude-opus-4-5',
    maxTurns: 50,
    allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Grep', 'Glob'],
    permissionMode: 'acceptEdits',
    hooks: {
      preToolUse: (toolCall) => {
        // Gefährliche Operationen blockieren
        const dangerousPatterns = [
          /rm\s+-rf/,
          /DROP\s+TABLE/i,
          /DELETE\s+FROM/i,
          /format\s+/,
          /mkfs/,
          /dd\s+if=/,
        ];
        if (toolCall.tool === 'Bash') {
          for (const pattern of dangerousPatterns) {
            if (pattern.test(toolCall.input.command)) {
              return {
                decision: 'deny',
                reason: `Blocked dangerous command: ${toolCall.input.command}`
              };
            }
          }
        }
        // Nur Dateien im Anwendungsverzeichnis editieren
        if (['Write', 'Edit', 'MultiEdit'].includes(toolCall.tool)) {
          if (!toolCall.input.path?.startsWith('/app/')) {
            return {
              decision: 'deny',
              reason: 'Edits only allowed within /app/ directory'
            };
          }
        }
        return { decision: 'allow' };
      }
    },
    systemPrompt: `Du bist ein Repair-Agent. Deine Aufgabe: Wende einen
      gezielten Code-Patch an, um das diagnostizierte Problem zu lösen.

      REGELN:
      - Ändere nur die minimal notwendigen Dateien
      - Erstelle keine neuen Abhängigkeiten, wenn es vermeidbar ist
      - Kommentiere deine Änderungen im Code
      - Fasse am Ende zusammen, welche Dateien du geändert hast und warum
      - Wenn du dir unsicher bist, STOPPE und melde ESCALATED`
  });

  const result = await agent.run(
    `Behebe folgendes Problem:
     Diagnose: ${diagnosis.rootCause}
     Betroffene Dateien: ${diagnosis.affectedFiles.join(', ')}
     Vorgeschlagener Fix: ${diagnosis.suggestedFix}

     Wende den Fix direkt auf die Dateien an.`
  );

  return parsePatchResult(result);
}
Schlüssel-Features des Agent SDK für Code-Level Healing:

Task-Tool für Subagenten: Diagnose kann parallele Untersuchungen starten (z.B. ein Subagent prüft Logs, ein anderer den Quellcode, ein dritter die Config)
preToolUse-Hooks als Sicherheitsschicht: Blockiert gefährliche Bash-Befehle und beschränkt Datei-Edits auf das Anwendungsverzeichnis
maxTurns-Limit: Verhindert Endlosschleifen bei komplexen Diagnosen
permissionMode-Trennung: Diagnose-Agent hat nur Lesezugriff, Patch-Agent hat Schreibzugriff — zwei getrennte Sessions, zwei getrennte Berechtigungsstufen
Automatic Context Compaction: Bei langen Diagnose-Sessions fasst das SDK den Kontext automatisch zusammen
MCP-Server-Integration: Falls externe Tools benötigt werden (z.B. Datenbank-Client, Monitoring-API), können diese als MCP-Server angebunden werden

Sicherheits-Guardrails: Vier Schutzschichten
1. Human-in-the-Loop (Admin-Gate)
Kein Agent-Vorgang startet ohne explizite Admin-Genehmigung. Bei hochriskanten Patches (z.B. Datenbanklogik, Authentifizierung, Core Business Logic) muss der Admin den Patch-Diff zusätzlich reviewen, bevor er angewendet wird. Der Admin kann jederzeit abbrechen.
2. Agent-Level-Guardrails (preToolUse-Hooks)
Gefährliche Befehle werden vor Ausführung blockiert. Datei-Edits sind auf das Anwendungsverzeichnis beschränkt. Ein maxTurns-Limit verhindert Endlosschleifen. Der Diagnose-Agent hat keinen Schreibzugriff.
3. Snapshot + Rollback
Vor jeder Codeänderung wird ein Snapshot der betroffenen Dateien erstellt. Wenn die Post-Patch-Verifikation fehlschlägt, werden alle Dateien automatisch auf den Snapshot-Stand zurückgesetzt und der betroffene Service wird neu gestartet.
4. Immutable Audit Trail
Jede Agent-Aktion wird protokolliert: wer hat genehmigt, was hat der Agent getan, welche Dateien wurden geändert, was war das Ergebnis. Dieses Log ist append-only und nicht nachträglich veränderbar. Relevant für Compliance (DSGVO, SOC-2) und Post-Mortem-Analyse.
Graduated Autonomy: Vertrauen schrittweise aufbauen
Das System unterstützt vier Autonomie-Level, die der Admin konfigurieren kann:
LevelNameVerhalten0OBSERVEAgent diagnostiziert nur, schlägt Fix vor, ändert nichts1SUGGESTAgent erstellt Patch-Diff, Admin muss jeden Patch einzeln reviewen und freigeben2AUTO_LOWLow-Risk-Patches (Logging, Formatting, Non-Breaking Config) werden automatisch angewendet; alles andere geht zum Admin-Review3AUTO_ALLAlle Patches werden nach Diagnose automatisch angewendet (mit Rollback-Garantie)
Neue Deployments starten immer bei Level 0. Der Admin kann das Level erhöhen, sobald Vertrauen in die Agent-Qualität aufgebaut ist.


## Add a section "Self-healing Capabilities" to root README.md 

Before the section "Managed Edienne" adapt the following
pitch to our situation and add some technical details from the implementation step:
--------
SelfHealing gives your application the ability to patch its own source code when users report problems — with full human oversight at every critical step.
Here's the workflow: A user files an issue describing what's broken. An admin reviews it, sets priority, and authorizes the AI agent to investigate. The agent — Claude Opus 4.5 via the Claude Agent SDK — analyzes source code, logs, and configuration across your NestJS and Python services, identifies the root cause, and produces a minimal code patch. Depending on the risk level, the patch is either applied automatically or presented to the admin for review. After patching, the affected service restarts and the system verifies the fix worked. If it didn't, automatic rollback kicks in.
This is not a copilot suggesting changes for you to implement. This is not an external SaaS analyzing your repo and filing PRs. This is an embedded repair system that lives inside your application, understands your code at the deepest level, and acts on explicit human authorization.
Four safety layers ensure you're always in control: admin approval gates, agent-level guardrails (dangerous commands blocked, file edits restricted), pre-patch snapshots with automatic rollback, and an immutable audit trail of every action.
The immune system your application never had — with a human hand on the switch.
---------