import { useEffect, useState } from 'react';

// The hint that a click on a Bundesland zooms in (MapView): first a few seconds after the map of Germany is ready, then
// once a minute, each time for a moment – until the person has zoomed into a Land once (remembered in the browser).
const SEEN_KEY = 'mastr.drillHintSeen';
const FIRST_AFTER_MS = 3000;
const SHOWN_MS = 4500;
const EVERY_MS = 60000;

const seen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

export function markDrillHintSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // private window or blocked storage: the hint may come again, nothing more
  }
}

// active: the map shows the Bundesländer of Germany, ready to be clicked. Returns whether the hint shows now.
export function useDrillHint(active) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active || seen()) return undefined;
    const timers = [];
    const show = () => {
      if (seen()) return;
      setVisible(true);
      timers.push(setTimeout(() => setVisible(false), SHOWN_MS));
    };
    timers.push(setTimeout(show, FIRST_AFTER_MS));
    const every = setInterval(show, EVERY_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(every);
      setVisible(false);
    };
  }, [active]);
  return active && visible;
}
