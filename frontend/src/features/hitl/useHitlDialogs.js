// useHitlDialogs — owns the six human-in-the-loop request states, their response
// handlers, and the request-id dedupe set. (Phase 3 of the App.jsx decomposition.)
//
// The interceptor hooks (Phase 4) call openFromEvent(type, data) to raise a dialog;
// nothing else in App touches HITL state. The dedupe ref lives here.

import { useState, useRef, useCallback } from 'react';
import { apiFetch } from '../../services/api';

export default function useHitlDialogs() {
  const [pendingElicitation, setPendingElicitation] = useState(null); // MCP tool elicitation
  const [pendingPermission, setPendingPermission] = useState(null);   // SDK canUseTool
  const [pendingQuestion, setPendingQuestion] = useState(null);       // AskUserQuestion
  const [pendingPlanApproval, setPendingPlanApproval] = useState(null); // ExitPlanMode
  const [pendingHITL, setPendingHITL] = useState(null);               // HITL Protocol verification
  const [pendingPairing, setPendingPairing] = useState(null);         // Telegram pairing

  // Track handled permission/question/pairing request IDs to prevent duplicates.
  const handledRequestIdsRef = useRef(new Set());

  // Handle elicitation response from user
  const handleElicitationResponse = useCallback(async (response) => {
    console.log('Sending elicitation response:', response);
    try {
      const res = await fetch('/mcp/elicitation/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test123'  // MCP auth token
        },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send elicitation response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending elicitation response:', err);
    } finally {
      setPendingElicitation(null);
    }
  }, []);

  // Handle SDK permission response from user (canUseTool callback)
  const handlePermissionResponse = useCallback(async (response) => {
    console.log('Sending permission response:', response);
    try {
      const res = await apiFetch('/api/claude/permission/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send permission response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending permission response:', err);
    } finally {
      setPendingPermission(null);
    }
  }, []);

  // Handle AskUserQuestion response from user
  const handleQuestionResponse = useCallback(async (response) => {
    console.log('Sending question response:', response);
    try {
      const res = await apiFetch('/api/claude/permission/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send question response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending question response:', err);
    } finally {
      setPendingQuestion(null);
    }
  }, []);

  // Handle plan approval response from user (ExitPlanMode)
  const handlePlanApprovalResponse = useCallback(async (response) => {
    console.log('Sending plan approval response:', response);
    try {
      const res = await apiFetch('/api/claude/permission/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send plan approval response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending plan approval response:', err);
    } finally {
      setPendingPlanApproval(null);
    }
  }, []);

  // Handle HITL Protocol verification response from user
  const handleHITLResponse = useCallback(async (response) => {
    console.log('Sending HITL response:', response);
    try {
      const res = await apiFetch('/api/hitl/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send HITL response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending HITL response:', err);
    } finally {
      setPendingHITL(null);
    }
  }, []);

  // Handle pairing request response from admin (Telegram pairing)
  const handlePairingResponse = useCallback(async (response) => {
    console.log('Sending pairing response:', response);
    try {
      const res = await apiFetch('/api/remote-sessions/pairing/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      });

      if (!res.ok) {
        console.error('Failed to send pairing response:', await res.text());
      }
    } catch (err) {
      console.error('Error sending pairing response:', err);
    } finally {
      setPendingPairing(null);
    }
  }, []);

  /**
   * Raise a HITL dialog from an interceptor event. Dedupe-aware for the request
   * types that carry an id (permission, question, plan, hitl, pairing).
   *
   * @param {string} type  one of: elicitation_request | permission_request |
   *                        ask_user_question | plan_approval | hitl_request | pairing_request
   * @param {object} data
   * @returns {boolean} whether the dialog was opened (false if deduped)
   */
  const openFromEvent = useCallback((type, data) => {
    const dedupe = (id, set) => {
      if (handledRequestIdsRef.current.has(id)) return false;
      handledRequestIdsRef.current.add(id);
      set(data);
      return true;
    };
    switch (type) {
      case 'elicitation_request':
        setPendingElicitation(data);
        return true;
      case 'permission_request':
        return dedupe(data?.id, setPendingPermission);
      case 'ask_user_question':
        return dedupe(data?.id, setPendingQuestion);
      case 'plan_approval':
        return dedupe(data?.id, setPendingPlanApproval);
      case 'hitl_request':
        return dedupe(data?.id, setPendingHITL);
      case 'pairing_request':
        return dedupe(data?.id, setPendingPairing);
      default:
        return false;
    }
  }, []);

  const hasPending = Boolean(
    pendingElicitation || pendingPermission || pendingQuestion ||
    pendingPlanApproval || pendingHITL || pendingPairing
  );

  return {
    // pending state + setters (setters used by the pending-pairings fetch effect)
    pendingElicitation, setPendingElicitation,
    pendingPermission, setPendingPermission,
    pendingQuestion, setPendingQuestion,
    pendingPlanApproval, setPendingPlanApproval,
    pendingHITL, setPendingHITL,
    pendingPairing, setPendingPairing,
    // response handlers
    handleElicitationResponse,
    handlePermissionResponse,
    handleQuestionResponse,
    handlePlanApprovalResponse,
    handleHITLResponse,
    handlePairingResponse,
    // event entry point + dedupe ref (shared with the pending-pairings fetch)
    openFromEvent,
    handledRequestIdsRef,
    hasPending,
  };
}
