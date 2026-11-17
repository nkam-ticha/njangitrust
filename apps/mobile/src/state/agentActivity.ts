import { create } from 'zustand';

// What the agent is doing right now, so the whole app can show it (the floating orb, the glow
// around the screen). Set by the Njangi tab while a message is being answered.
export type AgentMode = 'idle' | 'thinking' | 'speaking';

interface AgentActivityState {
  mode: AgentMode;
  setMode: (mode: AgentMode) => void;
}

export const useAgentActivity = create<AgentActivityState>((set) => ({
  mode: 'idle',
  setMode: (mode) => set({ mode }),
}));
