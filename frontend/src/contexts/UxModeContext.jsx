import React, { createContext, useContext, useState, useCallback } from 'react';

const UxModeContext = createContext({ uxType: 'verbose', isMinimalistic: false, toggleUxMode: () => {} });

function getInitialUxType() {
  const override = localStorage.getItem('uxModeOverride');
  if (override === 'verbose' || override === 'minimalistic') return override;
  return import.meta.env.VITE_UX_TYPE || 'verbose';
}

export function UxModeProvider({ children }) {
  const [uxType, setUxType] = useState(getInitialUxType);

  const toggleUxMode = useCallback(() => {
    setUxType(prev => {
      const next = prev === 'verbose' ? 'minimalistic' : 'verbose';
      localStorage.setItem('uxModeOverride', next);
      return next;
    });
  }, []);

  const value = { uxType, isMinimalistic: uxType === 'minimalistic', toggleUxMode };

  return (
    <UxModeContext.Provider value={value}>
      {children}
    </UxModeContext.Provider>
  );
}

export function useUxMode() {
  return useContext(UxModeContext);
}
