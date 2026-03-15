import React, { createContext, useContext } from 'react';

const MuxSSEContext = createContext(null);

export function MuxSSEProvider({ mux, children }) {
  return <MuxSSEContext.Provider value={mux}>{children}</MuxSSEContext.Provider>;
}

export function useMuxSSE() {
  return useContext(MuxSSEContext);
}
