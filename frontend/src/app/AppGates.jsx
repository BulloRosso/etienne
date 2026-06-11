// AppGates — the early-return ladder that guards the main app: required services
// → auth → first-run self-diagnostic → configuration → project load. Renders
// `children` only when every gate passes. (Phase 6 of the App.jsx decomposition.)
//
// Gate state stays owned by App (the effects that populate it live there); this
// component is the presentational ladder, keeping ~70 lines of branch JSX out of
// the composition root.

import React from 'react';
import { Box, CircularProgress } from '@mui/material';
import ServiceHealthGate from '../components/ServiceHealthGate';
import LoginDialog from '../components/LoginDialog';
import FirstRunPage from '../pages/FirstRunPage';
import Onboarding from '../components/Onboarding';

function Loading() {
  return (
    <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'background.default' }}>
      <CircularProgress />
    </Box>
  );
}

export default function AppGates({
  servicesReady,
  setServicesReady,
  authLoading,
  isAuthenticated,
  firstRunStatus,
  firstRunOverride,
  markFirstRunComplete,
  setFirstRunOverride,
  showConfigurationRequired,
  onOnboardingComplete,
  projectLoading,
  children,
}) {
  // Show loading while checking required services
  if (servicesReady === null) return <Loading />;

  // Show service health gate if required services are not running
  if (servicesReady === false) {
    return <ServiceHealthGate onReady={() => setServicesReady(true)} />;
  }

  // Show loading while checking authentication
  if (authLoading) return <Loading />;

  // Show login dialog if not authenticated
  if (!isAuthenticated) {
    return <LoginDialog onSuccess={() => {}} />;
  }

  // First-run self-diagnostic — shown once per user (unless re-opened via banner).
  // Waits for firstRunStatus to load; falsy status means we don't know yet.
  if (firstRunStatus === null) return <Loading />;
  if (!firstRunStatus.completed || firstRunOverride) {
    return (
      <FirstRunPage
        onComplete={() => {
          markFirstRunComplete();
          setFirstRunOverride(false);
        }}
      />
    );
  }

  // Show loading while checking configuration
  if (showConfigurationRequired === null) return <Loading />;

  // Show onboarding wizard if configuration is required
  if (showConfigurationRequired) {
    return <Onboarding onComplete={onOnboardingComplete} />;
  }

  // Show loading while restoring project from localStorage
  if (projectLoading) return <Loading />;

  return children;
}
