import { COLOR_MODES, STATUSES, useTurbines } from './turbines';
import WindControls from './WindControls';
import './wind.css';

const STATUS_PARAM = 'anlagen';
const COLOR_PARAM = 'farbe';
const DEFAULT_STATUS = 'in_betrieb';

/**
 * The analyses of wind on the page Anlagen: every turbine on its own (not per Windpark). scopeKey, scopeName: the area;
 * lagen: the Lage filter (an Land, auf See); state: the dashboard's, for the turbines' status and colour in the URL.
 * cards: rendered into the grid of cards beside the size classes; the panels follow.
 */
export default function useWindAnalyses({ state, lagen, enabled }) {
  const statuses = (state.searchParams.get(STATUS_PARAM) ?? DEFAULT_STATUS).split(',').filter((id) => STATUSES.some((s) => s.id === id));
  const chosen = statuses.length ? statuses : [DEFAULT_STATUS];
  const colorMode = COLOR_MODES.some((m) => m.id === state.searchParams.get(COLOR_PARAM)) ? state.searchParams.get(COLOR_PARAM) : 'zeit';
  const turbines = useTurbines({ scopeKey: state.scopeKey, lagen, statuses: chosen, colorMode, enabled });
  const controls = (
    <WindControls
      statuses={chosen}
      onStatuses={(ids) => state.setParam(STATUS_PARAM, ids.join(','), DEFAULT_STATUS)}
      colorMode={colorMode}
      onColorMode={(id) => state.setParam(COLOR_PARAM, id, 'zeit')}
      count={turbines.rows?.length ?? null}
    />
  );
  return { turbines, controls, statuses: chosen };
}

