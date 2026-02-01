import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App.jsx';
import { ProjectProvider } from './contexts/ProjectContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';

const theme = createTheme({
  typography: {
    fontFamily: 'Roboto, sans-serif',
  },
});

createRoot(document.getElementById('root')).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <AuthProvider>
      <ProjectProvider>
        <App />
      </ProjectProvider>
    </AuthProvider>
  </ThemeProvider>
);
