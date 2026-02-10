import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ProjectProvider } from './contexts/ProjectContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ThemeModeProvider } from './contexts/ThemeContext.jsx';

createRoot(document.getElementById('root')).render(
  <ThemeModeProvider>
    <AuthProvider>
      <ProjectProvider>
        <App />
      </ProjectProvider>
    </AuthProvider>
  </ThemeModeProvider>
);
