// Suppress noisy "Ignoring message from unknown source" console.error from
// @mcp-ui/client's PostMessageClientTransport — triggered by browser extensions
// (e.g. React DevTools) sending postMessage events on the window.
const _origConsoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0] === 'Ignoring message from unknown source') return;
  _origConsoleError.apply(console, args);
};

import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ProjectProvider } from './contexts/ProjectContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ThemeModeProvider } from './contexts/ThemeContext.jsx';
import { UxModeProvider } from './contexts/UxModeContext.jsx';
import './i18n';

createRoot(document.getElementById('root')).render(
  <Suspense fallback={<div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
    <ThemeModeProvider>
      <UxModeProvider>
        <AuthProvider>
          <ProjectProvider>
            <App />
          </ProjectProvider>
        </AuthProvider>
      </UxModeProvider>
    </ThemeModeProvider>
  </Suspense>
);
