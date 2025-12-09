import React, { useState } from 'react';
import { Box, Paper, Typography, Button, CircularProgress } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

/**
 * PlanApprovalTimeline - Renders when ExitPlanMode tool is called
 * Shows the plan is ready for user approval with Approve/Reject buttons
 */
export default function PlanApprovalTimeline({
  args,
  showBullet = true,
  onApprove,
  onReject,
  isApproved,
  isRejected
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async () => {
    if (onApprove) {
      setIsLoading(true);
      try {
        await onApprove();
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleReject = async () => {
    if (onReject) {
      setIsLoading(true);
      try {
        await onReject();
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Determine the current state
  const hasResponded = isApproved || isRejected;

  return (
    <Box sx={{ mb: 2, position: 'relative' }}>
      {/* Timeline connector line */}
      <Box
        sx={{
          position: 'absolute',
          left: '0px',
          top: showBullet ? '24px' : '0px',
          bottom: '-16px',
          width: '1px',
          backgroundColor: '#e0e0e0'
        }}
      />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, ml: showBullet ? 0 : '10px' }}>
        {/* Timeline point - green for plan ready */}
        {showBullet && (
          <Box
            sx={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: isApproved ? '#4caf50' : isRejected ? '#f44336' : '#ff9800',
              zIndex: 1,
              flexShrink: 0,
              mt: 0.5,
              ml: '-3px'
            }}
          />
        )}

        {/* Icon */}
        <DescriptionOutlinedIcon sx={{ fontSize: '18px', color: '#666', flexShrink: 0 }} />

        {/* Title */}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 'bold',
            color: '#333',
            fontFamily: 'monospace',
            flexShrink: 0
          }}
        >
          ExitPlanMode
        </Typography>

        {/* Status text */}
        <Typography
          variant="body2"
          sx={{
            color: isApproved ? '#4caf50' : isRejected ? '#f44336' : '#ff9800',
            fontWeight: 500,
            flex: 1
          }}
        >
          {isApproved ? 'Plan approved' : isRejected ? 'Plan rejected' : 'Plan ready for approval'}
        </Typography>
      </Box>

      {/* Approval card */}
      <Box sx={{ ml: showBullet ? '10px' : '20px' }}>
        <Paper
          sx={{
            p: 2,
            backgroundColor: isApproved ? '#e8f5e9' : isRejected ? '#ffebee' : '#fff8e1',
            borderRadius: 1,
            border: '1px solid',
            borderColor: isApproved ? '#a5d6a7' : isRejected ? '#ef9a9a' : '#ffe082'
          }}
        >
          {hasResponded ? (
            // Show result state
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {isApproved ? (
                <>
                  <CheckCircleOutlineIcon sx={{ color: '#4caf50' }} />
                  <Typography variant="body2" sx={{ color: '#2e7d32' }}>
                    Plan approved - switching to work mode to execute
                  </Typography>
                </>
              ) : (
                <>
                  <CancelOutlinedIcon sx={{ color: '#f44336' }} />
                  <Typography variant="body2" sx={{ color: '#c62828' }}>
                    Plan rejected - please provide feedback or a new prompt
                  </Typography>
                </>
              )}
            </Box>
          ) : (
            // Show approval buttons
            <>
              <Typography variant="body2" sx={{ color: '#5d4037', mb: 2 }}>
                Claude has finished creating a plan. Review the plan and approve to continue with execution,
                or reject to provide feedback.
              </Typography>

              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button
                  variant="contained"
                  color="success"
                  size="small"
                  onClick={handleApprove}
                  disabled={isLoading}
                  startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
                  sx={{ textTransform: 'none' }}
                >
                  Approve Plan
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={handleReject}
                  disabled={isLoading}
                  startIcon={<CancelOutlinedIcon />}
                  sx={{ textTransform: 'none' }}
                >
                  Reject
                </Button>
              </Box>
            </>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
