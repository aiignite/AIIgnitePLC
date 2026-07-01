import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIProvider = 'openai' | 'anthropic' | 'ollama';

interface AISettings {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  systemPrompt: string;
}

interface AIState {
  settings: AISettings;
  updateSettings: (updates: Partial<AISettings>) => void;
  resetSettings: () => void;
}

const DEFAULT_SETTINGS: AISettings = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: '',
  baseUrl: '', // If empty, will use provider defaults
  systemPrompt: `You are an expert industrial automation engineer specializing in Siemens PLC programming. 
Your goal is to help users write correct, efficient, and safe Ladder Logic (LAD).
When providing code, use standard PLC terms and consider safety implications.`,
};

export const useAIStore = create<AIState>()(
  persist(
    set => ({
      settings: DEFAULT_SETTINGS,
      updateSettings: updates =>
        set(state => ({
          settings: { ...state.settings, ...updates },
        })),
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'ai-settings-storage',
    }
  )
);
