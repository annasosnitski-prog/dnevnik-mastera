import { useEffect, useState } from 'react';

// Independent of Theme (dark/light stays its own setting) — a single boolean
// that strips decorative chrome (NavFab gems/rays/glow, client-tab pendants)
// down to a plain functional layer. Persisted the same way as Theme itself
// (root attribute + localStorage, read back on boot), so it survives reload
// without living inside the unrelated Prefs bucket (brightness/textScale/…).
const STORAGE_KEY = 'inka-minimalism';
const ATTR = 'data-minimalism';

export function readInitialMinimalism(): boolean {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute(ATTR);
    if (attr === 'true' || attr === 'false') return attr === 'true';
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true' || stored === 'false') return stored === 'true';
  } catch {
    /* ignore */
  }
  return false;
}

export function applyMinimalism(minimalism: boolean) {
  document.documentElement.setAttribute(ATTR, String(minimalism));
  try {
    localStorage.setItem(STORAGE_KEY, String(minimalism));
  } catch {
    /* ignore */
  }
}

// Reads the root attribute and stays in sync with it — lets a component
// (NavFab, DetailScreen's client tabs, …) gate its own rendering on
// minimalism without threading a prop through every screen that mounts it,
// mirroring SkyBackgrounds' useIsLightTheme.
export function useMinimalism(): boolean {
  const [minimalism, setMinimalism] = useState(() => document.documentElement.getAttribute(ATTR) === 'true');
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setMinimalism(root.getAttribute(ATTR) === 'true'));
    observer.observe(root, { attributes: true, attributeFilter: [ATTR] });
    return () => observer.disconnect();
  }, []);
  return minimalism;
}
