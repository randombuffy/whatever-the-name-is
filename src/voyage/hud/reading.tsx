import { createContext, useCallback, useState } from 'react';

// Reading level for mission copy. "simple" (the default) uses everyday words for young
// learners; "detailed" shows the original technical wording. Numbers and rules are the
// same in both modes, only the explanations change.

export type ReadingMode = 'simple' | 'detailed';

const KEY = 'mars2100.reading';

export const ReadingContext = createContext<ReadingMode>('simple');

export function useReadingPreference(): [ReadingMode, () => void] {
  const [mode, setMode] = useState<ReadingMode>(() => {
    try {
      return window.localStorage.getItem(KEY) === 'detailed' ? 'detailed' : 'simple';
    } catch {
      return 'simple';
    }
  });
  const toggle = useCallback(() => {
    setMode((current) => {
      const next: ReadingMode = current === 'simple' ? 'detailed' : 'simple';
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        // Preference not remembered; it still applies for this session.
      }
      return next;
    });
  }, []);
  return [mode, toggle];
}

// Glossary entries; text in the locale files (glossary.<id>.term / .meaning).
export const GLOSSARY_IDS = ['sol', 'eclss', 'regolith', 'dose', 'spe', 'cargo', 'power'] as const;
