import { createContext } from 'react';

// The place in the dashboard's header for the choice of the area (Dashboard.jsx): a page renders its ScopeBar where it
// likes, the bar shows up there – in the header, above the tabs, apart from what the page shows
export const ScopeSlot = createContext(null);
