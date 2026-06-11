// HitlDialogs — renders the six human-in-the-loop modals. (Phase 3.)
// Driven entirely by the state/handlers from useHitlDialogs.

import React from 'react';
import ElicitationModal from '../../components/ElicitationModal';
import PermissionModal from '../../components/PermissionModal';
import AskUserQuestionModal from '../../components/AskUserQuestionModal';
import PlanApprovalModal from '../../components/PlanApprovalModal';
import PairingRequestModal from '../../components/PairingRequestModal';
import HITLApprovalModal from '../../components/HITLApprovalModal';

export default function HitlDialogs({
  currentProject,
  pendingElicitation, setPendingElicitation, handleElicitationResponse,
  pendingPermission, setPendingPermission, handlePermissionResponse,
  pendingQuestion, setPendingQuestion, handleQuestionResponse,
  pendingPlanApproval, setPendingPlanApproval, handlePlanApprovalResponse,
  pendingPairing, setPendingPairing, handlePairingResponse,
  pendingHITL, setPendingHITL, handleHITLResponse,
}) {
  return (
    <>
      {/* MCP Elicitation Modal */}
      <ElicitationModal
        open={!!pendingElicitation}
        elicitation={pendingElicitation}
        onRespond={handleElicitationResponse}
        onClose={() => setPendingElicitation(null)}
      />

      {/* SDK Permission Modal (canUseTool callback) */}
      <PermissionModal
        open={!!pendingPermission}
        permission={pendingPermission}
        onRespond={handlePermissionResponse}
        onClose={() => setPendingPermission(null)}
      />

      {/* AskUserQuestion Modal */}
      <AskUserQuestionModal
        open={!!pendingQuestion}
        question={pendingQuestion}
        onRespond={handleQuestionResponse}
        onClose={() => setPendingQuestion(null)}
      />

      {/* Plan Approval Modal (ExitPlanMode) */}
      <PlanApprovalModal
        open={!!pendingPlanApproval}
        plan={pendingPlanApproval}
        onRespond={handlePlanApprovalResponse}
        onClose={() => setPendingPlanApproval(null)}
        currentProject={currentProject}
      />

      {/* Telegram Pairing Request Modal */}
      <PairingRequestModal
        open={!!pendingPairing}
        pairing={pendingPairing}
        onRespond={handlePairingResponse}
        onClose={() => setPendingPairing(null)}
      />

      {/* HITL Protocol Verification Modal */}
      <HITLApprovalModal
        open={!!pendingHITL}
        hitlRequest={pendingHITL}
        onRespond={handleHITLResponse}
        onClose={() => setPendingHITL(null)}
      />
    </>
  );
}
