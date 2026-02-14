import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  TextField,
  Stepper,
  Step,
  StepLabel,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  CircularProgress,
  Alert,
  Checkbox,
  FormGroup,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Chip,
  Divider,
  Switch,
  Select,
  MenuItem,
  InputLabel,
} from '@mui/material';
import Editor from '@monaco-editor/react';
import { MdClose, MdDescription, MdComment } from 'react-icons/md';
import { IoShieldCheckmark } from 'react-icons/io5';
import ComplianceGuidelineViewer from './ComplianceGuidelineViewer';
import { useThemeMode } from '../contexts/ThemeContext.jsx';

const INITIAL_STEPS = [
  { label: 'Review Requirements' },
  { label: 'Review Deliverables' },
  { label: 'Release Information' },
  { label: 'Confirm & Create' },
];

const UPDATE_STEPS = [
  { label: 'Review Requirements' },
  { label: 'Review Changes' },
  { label: 'Edit Release Document' },
  { label: 'Release Information' },
  { label: 'Confirm & Create' },
];

export default function ComplianceReleaseWizard({ open, onClose, projectName, status, onReleaseCreated }) {
  const { mode: themeMode } = useThemeMode();
  const [activeStep, setActiveStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [guidelineOpen, setGuidelineOpen] = useState(false);
  const [claudeMdContent, setClaudeMdContent] = useState('');

  // Common form fields
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerRole, setReviewerRole] = useState('');
  const [summary, setSummary] = useState('');
  const [aiSystemUsed, setAiSystemUsed] = useState('Claude Opus 4.6 via Claude Agent SDK');
  const [reviewScope, setReviewScope] = useState('');
  const [reviewOutcome, setReviewOutcome] = useState('APPROVED');
  const [knownLimitations, setKnownLimitations] = useState('');
  const [riskAssessment, setRiskAssessment] = useState('');
  const [notes, setNotes] = useState('');

  // Review deliverables checkboxes
  const [reviewedCode, setReviewedCode] = useState(false);
  const [reviewedDocs, setReviewedDocs] = useState(false);
  const [reviewedConfig, setReviewedConfig] = useState(false);

  // Update release fields
  const [requirementsChanged, setRequirementsChanged] = useState(false);
  const [requirementsChangeDescription, setRequirementsChangeDescription] = useState('');
  const [compiledDocument, setCompiledDocument] = useState('');
  const [fallbackPlan, setFallbackPlan] = useState('git checkout previous-tag');
  const [changeEntries, setChangeEntries] = useState([{ type: 'Changed', description: '' }]);

  const isInitial = status?.isInitialRelease;
  const steps = isInitial ? INITIAL_STEPS : UPDATE_STEPS;

  // Load mission file content when dialog opens
  useEffect(() => {
    if (open && projectName) {
      loadClaudeMd();
    }
    if (open) {
      resetWizard();
    }
  }, [open, projectName]);

  // Auto-compile document when entering the editor step (update release step 2)
  useEffect(() => {
    if (!isInitial && activeStep === 2 && status?.releaseComments) {
      compileDocument();
    }
  }, [activeStep]);

  const resetWizard = () => {
    setActiveStep(0);
    setError(null);
    setReviewerName('');
    setReviewerRole('');
    setSummary('');
    setAiSystemUsed('Claude Opus 4.6 via Claude Agent SDK');
    setReviewScope('');
    setReviewOutcome('APPROVED');
    setKnownLimitations('');
    setRiskAssessment('');
    setNotes('');
    setReviewedCode(false);
    setReviewedDocs(false);
    setReviewedConfig(false);
    setRequirementsChanged(false);
    setRequirementsChangeDescription('');
    setCompiledDocument('');
    setFallbackPlan('git checkout previous-tag');
    setChangeEntries([{ type: 'Changed', description: '' }]);
  };

  const loadClaudeMd = async () => {
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:6060';
      const response = await fetch(`${API_BASE}/api/claude/mission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName }),
      });
      if (response.ok) {
        const data = await response.json();
        setClaudeMdContent(data.content || '');
      }
    } catch (err) {
      console.error('Failed to load mission file:', err);
    }
  };

  const saveClaudeMd = async () => {
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:6060';
      await fetch(`${API_BASE}/api/claude/mission/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, content: claudeMdContent }),
      });
    } catch (err) {
      console.error('Failed to save mission file:', err);
    }
  };

  const compileDocument = () => {
    const comments = status?.releaseComments || {};
    const previousVersion = status?.currentVersion || 'v1.0';
    const nextMinor = previousVersion.match(/v(\d+)\.(\d+)/);
    const nextVersion = nextMinor ? `v${nextMinor[1]}.${parseInt(nextMinor[2]) + 1}` : 'v1.1';
    const today = new Date().toISOString().split('T')[0];

    // Build annotation table rows from release comments
    const commentEntries = Object.entries(comments);
    let annotationRows = '';
    if (commentEntries.length > 0) {
      annotationRows = commentEntries.map(([filePath, comment]) =>
        `| ${filePath} | ${comment} | [reason] | Low |`
      ).join('\n');
    } else {
      annotationRows = '| [file or component] | [description] | [reason] | Low |';
    }

    const doc = `# Diff Protocol — ${previousVersion} → ${nextVersion}

## Metadata
- Date: ${today}
- Reviewer: [Your Full Name]
- Role: [Your role/title]
- Previous Release: ${previousVersion}

## Change Summary

| File / Area | What Changed | Why | Risk Level |
|---|---|---|---|
${annotationRows}

## Review Outcome
APPROVED

## Risk Assessment
[Assessment of new risks introduced by changes.]

## Fallback Plan
git checkout ${previousVersion}
`;
    setCompiledDocument(doc);
  };

  // ── Change entries management ──
  const addChangeEntry = () => {
    setChangeEntries([...changeEntries, { type: 'Changed', description: '' }]);
  };

  const updateChangeEntry = (index, field, value) => {
    const updated = [...changeEntries];
    updated[index][field] = value;
    setChangeEntries(updated);
  };

  const removeChangeEntry = (index) => {
    setChangeEntries(changeEntries.filter((_, i) => i !== index));
  };

  // ── Navigation ──
  const canProceed = () => {
    if (isInitial) {
      switch (activeStep) {
        case 0: return true; // review requirements
        case 1: return reviewedCode || reviewedDocs || reviewedConfig;
        case 2: return reviewerName.trim() && reviewerRole.trim() && summary.trim();
        case 3: return true;
        default: return true;
      }
    } else {
      switch (activeStep) {
        case 0: return true;
        case 1: return true;
        case 2: return compiledDocument.trim().length > 0;
        case 3: return reviewerName.trim() && reviewerRole.trim() && summary.trim();
        case 4: return true;
        default: return true;
      }
    }
  };

  const handleNext = () => {
    if (activeStep === 0) {
      saveClaudeMd();
    }
    if (activeStep < steps.length - 1) {
      setActiveStep(activeStep + 1);
    }
  };

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  const handleCreateRelease = async () => {
    setCreating(true);
    setError(null);

    try {
      const body = {
        reviewerName,
        reviewerRole,
        summary,
        aiSystemUsed,
        reviewScope,
        reviewOutcome,
        knownLimitations,
        riskAssessment,
        notes,
      };

      if (!isInitial) {
        body.compiledDocument = compiledDocument;
        body.changeEntries = changeEntries.filter(e => e.description.trim());
        body.fallbackPlan = fallbackPlan;
        body.requirementsChanged = requirementsChanged;
        body.requirementsChangeDescription = requirementsChangeDescription;
      }

      const response = await fetch(`/api/compliance/${projectName}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create release');
      }

      const data = await response.json();
      if (onReleaseCreated) {
        onReleaseCreated(data.release);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create release');
    } finally {
      setCreating(false);
    }
  };

  // ── Computed values ──
  const nextVersion = (() => {
    if (isInitial) return 'v1.0';
    const prev = status?.currentVersion || 'v1.0';
    const match = prev.match(/v(\d+)\.(\d+)/);
    return match ? `v${match[1]}.${parseInt(match[2]) + 1}` : 'v1.1';
  })();

  const sessionCount = status?.chatSessions?.length || 0;
  const sessionDateRange = sessionCount > 0
    ? `${status.chatSessions[status.chatSessions.length - 1].timestamp.split('T')[0]} – ${status.chatSessions[0].timestamp.split('T')[0]}`
    : 'N/A';

  const releaseCommentCount = status?.releaseComments
    ? Object.keys(status.releaseComments).length
    : 0;

  // ── Step renderers ──

  const renderReviewRequirements = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Project Requirements
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<IoShieldCheckmark />}
          onClick={() => setGuidelineOpen(true)}
        >
          View Compliance Guidelines
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Review the project requirements below. Confirm they accurately reflect the project intent, constraints, and acceptance criteria.
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0, border: '1px solid #ddd', borderRadius: 1 }}>
        <Editor
          height="100%"
          language="markdown"
          value={claudeMdContent}
          onChange={(value) => setClaudeMdContent(value || '')}
          theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
          options={{ minimap: { enabled: false }, wordWrap: 'on', lineNumbers: 'off' }}
        />
      </Box>
      {!isInitial && (
        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={<Switch checked={requirementsChanged} onChange={(e) => setRequirementsChanged(e.target.checked)} />}
            label="Requirements have changed since last release"
          />
          {requirementsChanged && (
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Describe what changed in the requirements"
              value={requirementsChangeDescription}
              onChange={(e) => setRequirementsChangeDescription(e.target.value)}
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      )}
    </Box>
  );

  const renderReviewDeliverables = () => (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Review Deliverables
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Confirm you have manually reviewed the project deliverables. This is the core human oversight step.
      </Typography>

      <FormGroup sx={{ mb: 2 }}>
        <FormControlLabel
          control={<Checkbox checked={reviewedCode} onChange={(e) => setReviewedCode(e.target.checked)} />}
          label="I have reviewed all code files (logic, test coverage, security)"
        />
        <FormControlLabel
          control={<Checkbox checked={reviewedDocs} onChange={(e) => setReviewedDocs(e.target.checked)} />}
          label="I have reviewed all documents (accuracy, completeness)"
        />
        <FormControlLabel
          control={<Checkbox checked={reviewedConfig} onChange={(e) => setReviewedConfig(e.target.checked)} />}
          label="I have reviewed all configuration (settings, credentials, environment)"
        />
      </FormGroup>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Project Files ({status?.projectFiles?.length || 0})
      </Typography>
      <Box sx={{ maxHeight: 150, overflow: 'auto', border: '1px solid #eee', borderRadius: 1, p: 1 }}>
        {(status?.projectFiles || []).map((file) => (
          <Typography key={file} variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', py: 0.25 }}>
            {file}
          </Typography>
        ))}
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Chat Sessions (Audit Trail)
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {sessionCount} session{sessionCount !== 1 ? 's' : ''} archived in .etienne/ ({sessionDateRange})
      </Typography>
    </Box>
  );

  const renderReviewChanges = () => {
    const comments = status?.releaseComments || {};
    const commentEntries = Object.entries(comments);

    return (
      <Box>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          Review Changes &amp; Release Comments
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The following files have release comments that will be compiled into the diff protocol.
        </Typography>

        {commentEntries.length === 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            No release comments have been added yet. You can still proceed — the release document editor in the next step allows you to add change annotations manually.
          </Alert>
        ) : (
          <List dense>
            {commentEntries.map(([filePath, comment]) => (
              <ListItem key={filePath} sx={{ borderBottom: '1px solid #eee' }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <MdComment size={20} color="#1976d2" />
                </ListItemIcon>
                <ListItemText
                  primary={<Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{filePath}</Typography>}
                  secondary={comment}
                />
              </ListItem>
            ))}
          </List>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Chat Sessions (Audit Trail)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {sessionCount} session{sessionCount !== 1 ? 's' : ''} archived ({sessionDateRange})
        </Typography>
      </Box>
    );
  };

  const renderEditDocument = () => (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Edit Release Document (DIFF_PROTOCOL)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This document has been pre-populated from your release comments. Edit as needed — this will become DIFF_PROTOCOL_{nextVersion}.md.
      </Typography>
      <Box sx={{ height: 300, border: '1px solid #ddd', borderRadius: 1, mb: 2 }}>
        <Editor
          height="100%"
          language="markdown"
          value={compiledDocument}
          onChange={(value) => setCompiledDocument(value || '')}
          theme={themeMode === 'dark' ? 'vs-dark' : 'light'}
          options={{ minimap: { enabled: false }, wordWrap: 'on', lineNumbers: 'on' }}
        />
      </Box>

      <TextField
        fullWidth
        label="Fallback Plan"
        value={fallbackPlan}
        onChange={(e) => setFallbackPlan(e.target.value)}
        helperText="How to revert if issues are discovered (e.g. git checkout v1.0)"
        sx={{ mb: 2 }}
      />

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Changelog Entries
      </Typography>
      {changeEntries.map((entry, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={entry.type}
              onChange={(e) => updateChangeEntry(index, 'type', e.target.value)}
            >
              <MenuItem value="Added">Added</MenuItem>
              <MenuItem value="Changed">Changed</MenuItem>
              <MenuItem value="Fixed">Fixed</MenuItem>
              <MenuItem value="Removed">Removed</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            size="small"
            placeholder="Description of change"
            value={entry.description}
            onChange={(e) => updateChangeEntry(index, 'description', e.target.value)}
          />
          {changeEntries.length > 1 && (
            <IconButton size="small" onClick={() => removeChangeEntry(index)}>
              <MdClose />
            </IconButton>
          )}
        </Box>
      ))}
      <Button size="small" onClick={addChangeEntry}>+ Add entry</Button>
    </Box>
  );

  const renderReleaseInfo = () => (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        Release Information
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            fullWidth
            label="Reviewer Name *"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
          />
          <TextField
            fullWidth
            label="Reviewer Role *"
            value={reviewerRole}
            onChange={(e) => setReviewerRole(e.target.value)}
            placeholder="e.g. Lead Developer, Project Manager"
          />
        </Box>
        <TextField
          fullWidth
          label="Summary *"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="1-2 sentence description of what was built/changed"
        />
        <TextField
          fullWidth
          label="AI System Used"
          value={aiSystemUsed}
          onChange={(e) => setAiSystemUsed(e.target.value)}
        />
        <TextField
          fullWidth
          label="Review Scope"
          value={reviewScope}
          onChange={(e) => setReviewScope(e.target.value)}
          placeholder="e.g. code, documentation, configuration"
        />
        <FormControl>
          <FormLabel>Review Outcome</FormLabel>
          <RadioGroup
            row
            value={reviewOutcome}
            onChange={(e) => setReviewOutcome(e.target.value)}
          >
            <FormControlLabel value="APPROVED" control={<Radio />} label="Approved" />
            <FormControlLabel value="APPROVED WITH NOTES" control={<Radio />} label="Approved with Notes" />
          </RadioGroup>
        </FormControl>
        <TextField
          fullWidth
          multiline
          rows={2}
          label="Known Limitations"
          value={knownLimitations}
          onChange={(e) => setKnownLimitations(e.target.value)}
          placeholder="Any caveats, known issues, or areas where AI output required correction"
        />
        <TextField
          fullWidth
          multiline
          rows={2}
          label="Risk Assessment"
          value={riskAssessment}
          onChange={(e) => setRiskAssessment(e.target.value)}
          placeholder="Brief assessment of risks"
        />
        <TextField
          fullWidth
          multiline
          rows={2}
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional observations"
        />
      </Box>
    </Box>
  );

  const renderConfirm = () => (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        Confirm Release {nextVersion}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Box sx={{ backgroundColor: '#f5f5f5', borderRadius: 1, p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Release Summary</Typography>
        <Typography variant="body2"><strong>Version:</strong> {nextVersion}</Typography>
        <Typography variant="body2"><strong>Reviewer:</strong> {reviewerName} ({reviewerRole})</Typography>
        <Typography variant="body2"><strong>Summary:</strong> {summary}</Typography>
        <Typography variant="body2"><strong>Outcome:</strong> {reviewOutcome}</Typography>
      </Box>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>The following artifacts will be created:</Typography>
      <List dense>
        {isInitial ? (
          <>
            <ListItem>
              <ListItemIcon sx={{ minWidth: 36 }}><MdDescription size={20} /></ListItemIcon>
              <ListItemText primary="RELEASE_NOTES.md" secondary="Initial release sign-off document" />
            </ListItem>
            <ListItem>
              <ListItemIcon sx={{ minWidth: 36 }}><MdDescription size={20} /></ListItemIcon>
              <ListItemText primary="Mission file update" secondary="Requirements baseline v1.0 header added" />
            </ListItem>
          </>
        ) : (
          <>
            <ListItem>
              <ListItemIcon sx={{ minWidth: 36 }}><MdDescription size={20} /></ListItemIcon>
              <ListItemText primary={`DIFF_PROTOCOL_${nextVersion}.md`} secondary="Annotated change record" />
            </ListItem>
            <ListItem>
              <ListItemIcon sx={{ minWidth: 36 }}><MdDescription size={20} /></ListItemIcon>
              <ListItemText primary="CHANGELOG.md" secondary="Cumulative change log (created/updated)" />
            </ListItem>
            {requirementsChanged && (
              <ListItem>
                <ListItemIcon sx={{ minWidth: 36 }}><MdDescription size={20} /></ListItemIcon>
                <ListItemText primary="Mission file update" secondary={`Requirements update ${nextVersion} header added`} />
              </ListItem>
            )}
          </>
        )}
        <ListItem>
          <ListItemIcon sx={{ minWidth: 36 }}><IoShieldCheckmark size={20} /></ListItemIcon>
          <ListItemText primary="Checkpoint" secondary={`Release ${nextVersion} — ${summary}`} />
        </ListItem>
      </List>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {sessionCount} chat session{sessionCount !== 1 ? 's' : ''} archived in .etienne/ ({sessionDateRange})
      </Typography>
      {!isInitial && releaseCommentCount > 0 && (
        <Typography variant="body2" color="text.secondary">
          {releaseCommentCount} release comment{releaseCommentCount !== 1 ? 's' : ''} will be cleared after release.
        </Typography>
      )}
    </Box>
  );

  const renderStep = () => {
    if (isInitial) {
      switch (activeStep) {
        case 0: return renderReviewRequirements();
        case 1: return renderReviewDeliverables();
        case 2: return renderReleaseInfo();
        case 3: return renderConfirm();
        default: return null;
      }
    } else {
      switch (activeStep) {
        case 0: return renderReviewRequirements();
        case 1: return renderReviewChanges();
        case 2: return renderEditDocument();
        case 3: return renderReleaseInfo();
        case 4: return renderConfirm();
        default: return null;
      }
    }
  };

  const isLastStep = activeStep === steps.length - 1;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { height: '85vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IoShieldCheckmark size={24} color="#1976d2" />
            <Typography variant="h6">
              {isInitial ? 'Create Initial Release (v1.0)' : `Create Update Release (${nextVersion})`}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" disabled={creating}>
            <MdClose />
          </IconButton>
        </DialogTitle>

        <Box sx={{ px: 3, pb: 1 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {steps.map((step) => (
              <Step key={step.label}>
                <StepLabel>{step.label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        <DialogContent dividers sx={{ overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {renderStep()}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleBack} disabled={activeStep === 0 || creating}>
            Back
          </Button>
          <Box sx={{ flex: 1 }} />
          {isLastStep ? (
            <Button
              variant="contained"
              onClick={handleCreateRelease}
              disabled={creating || !canProceed()}
              startIcon={creating ? <CircularProgress size={20} /> : <IoShieldCheckmark />}
            >
              {creating ? 'Creating...' : `Create Release ${nextVersion}`}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={!canProceed()}
            >
              Next
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <ComplianceGuidelineViewer
        open={guidelineOpen}
        onClose={() => setGuidelineOpen(false)}
      />
    </>
  );
}
