import React, { useCallback, useRef } from 'react';
import LiveHTMLPreview from './LiveHTMLPreview';
import { agentBus } from '../services/agentBus';

/**
 * SimulatorViewer — wraps LiveHTMLPreview for `.simulator.html` files and
 * forwards every new click in the simulator iframe to the chat agent as a
 * `viewer-auto-prompt` event (via agentBus).
 *
 * Same shape as GanttDiagram's agentbusEventsOut pattern: the simulator's
 * postMessage payload is `{ appId, appName, clicks, currentScreen, expectedNext }`
 * (see simulator-author skill). We diff `clicks.length` against the previous
 * state to detect a NEW click and emit a single `simulator.clicked` event with
 * the new step. agentBus renders the chatTemplate, dispatches the
 * `viewer-auto-prompt` window event, and App.jsx routes it through
 * handleSendMessage so the agent reacts on the next turn.
 */
export default function SimulatorViewer({ filename, projectName, onViewerStateChange }) {
  const lastClickCountRef = useRef(0);

  const handleViewerStateChange = useCallback((state) => {
    // Forward to the regular viewer-state chain (preserves existing behaviour:
    // viewer state still ships with the next manual prompt via getViewerStates).
    onViewerStateChange?.(state);

    if (!state || !Array.isArray(state.clicks)) return;
    const prevCount = lastClickCountRef.current;
    const newCount = state.clicks.length;

    // Reset on viewer remount (state.clicks went from non-empty back to empty
    // when the initial handshake fires).
    if (newCount < prevCount) {
      lastClickCountRef.current = newCount;
      return;
    }
    if (newCount === prevCount) return;

    const latest = state.clicks[newCount - 1];
    lastClickCountRef.current = newCount;
    if (!latest) return;

    agentBus.emit(
      'simulator',
      'simulator.clicked',
      {
        appId: state.appId,
        appName: state.appName,
        stepId: latest.stepId,
        screenId: latest.screenId,
        correct: latest.correct,
        clickIndex: newCount,
        expectedNext: state.expectedNext,
        currentScreen: state.currentScreen,
      },
      { filename },
    );
  }, [filename, onViewerStateChange]);

  return (
    <LiveHTMLPreview
      filename={filename}
      projectName={projectName}
      onViewerStateChange={handleViewerStateChange}
    />
  );
}

SimulatorViewer.agentbusEventsOut = () => [
  {
    id: 'simulator.clicked',
    description: 'Trainee clicked a hot-spot in the application simulator. Coach the next step based on whether the click matched the expected sequence.',
    payloadSchema: {
      appId: 'string',
      appName: 'string',
      stepId: 'string',
      screenId: 'string',
      correct: 'boolean',
      clickIndex: 'number (1-based position in the click sequence)',
      expectedNext: 'string | null (the next expected stepId, or null if sequence is done)',
      currentScreen: 'string',
    },
    chatTemplate:
      "In '{{filename}}' ({{appName}}): trainee clicked '{{stepId}}' on screen '{{screenId}}' (step #{{clickIndex}}, correct={{correct}}). Expected next: {{expectedNext}}.",
    autoSubmit: true,
  },
];
