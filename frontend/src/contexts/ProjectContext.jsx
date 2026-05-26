import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

const ProjectContext = createContext();

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};

export const ProjectProvider = ({ children }) => {
  const [currentProject, setCurrentProject] = useState(null);
  const [projectExists, setProjectExists] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load currentProject from localStorage on mount. Re-run when an auth token appears
  // (login completes) so a stored project gets verified once we can actually call the API.
  useEffect(() => {
    let cancelled = false;
    const loadCurrentProject = async () => {
      const token =
        localStorage.getItem('auth_accessToken') || sessionStorage.getItem('auth_accessToken');
      if (cancelled) return;
      setLoading(true);
      const storedProject = localStorage.getItem('currentProject');

      if (storedProject) {
        if (!token) {
          // Not logged in yet — defer project verification until after login.
          setLoading(false);
          return;
        }
        // Verify project exists
        try {
          const response = await apiFetch('/api/claude/listProjects');
          const data = await response.json();
          const projects = data.projects || [];

          if (projects.includes(storedProject)) {
            setCurrentProject(storedProject);
            setProjectExists(true);
          } else {
            // Project doesn't exist, clear localStorage
            localStorage.removeItem('currentProject');
            setCurrentProject(null);
            setProjectExists(false);
          }
        } catch (error) {
          console.error('Failed to verify project:', error);
          setCurrentProject(null);
          setProjectExists(false);
        }
      }

      setLoading(false);
    };

    loadCurrentProject();
    // Re-verify when login completes (storage event fires from same-window updates we dispatch).
    const onAuthChange = () => loadCurrentProject();
    window.addEventListener('auth:login', onAuthChange);
    window.addEventListener('auth:logout', onAuthChange);
    return () => {
      cancelled = true;
      window.removeEventListener('auth:login', onAuthChange);
      window.removeEventListener('auth:logout', onAuthChange);
    };
  }, []);

  const setProject = async (projectName) => {
    if (projectName) {
      localStorage.setItem('currentProject', projectName);
      setCurrentProject(projectName);
      setProjectExists(true);
    } else {
      localStorage.removeItem('currentProject');
      setCurrentProject(null);
      setProjectExists(false);
    }
  };

  const value = {
    currentProject,
    projectExists,
    loading,
    setProject
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};
