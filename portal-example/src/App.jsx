import React from 'react';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';

// When the user clicks "Start Onboarding Agent" we send them back to
// http://localhost:5000. The Etienne shell uses a sessionStorage flag
// (`portalRedirected`) to avoid bouncing the user straight back here.
const AGENT_URL = 'http://localhost:5000';

export default function App() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)',
        p: 2,
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={6} sx={{ p: 5, borderRadius: 3 }}>
          <Stack spacing={3} alignItems="flex-start">
            <Typography variant="overline" color="primary">
              Lumitec
            </Typography>
            <Typography variant="h4" component="h1" fontWeight={600}>
              Welcome to Lumitec LED Onboarding
            </Typography>
            <Typography variant="body1" color="text.secondary">
              This portal walks new partners through Lumitec's LED product
              catalog, ordering process, and support workflow. When you're
              ready to start the guided onboarding, your AI co-worker Etienne
              will take it from here.
            </Typography>
            <Button
              variant="contained"
              size="large"
              onClick={() => window.location.assign(AGENT_URL)}
              sx={{ alignSelf: 'stretch', py: 1.5 }}
            >
              Start Onboarding Agent
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
