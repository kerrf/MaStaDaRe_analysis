// Greedy label placement, as vector maps place their symbols: the candidates in order of priority, each at the first of
// its positions around its point where it overlaps nothing placed before. A grid index keeps the test cheap.

const CELL = 64; // px

// The box of a label of size w × h at one position around a point (x, y) with a dot of radius r, gap px away from it
function boxAt(position, { x, y, w, h, r }, gap) {
  switch (position) {
    case 'right':
      return [x + r + gap, y - h / 2, x + r + gap + w, y + h / 2];
    case 'left':
      return [x - r - gap - w, y - h / 2, x - r - gap, y + h / 2];
    case 'top':
      return [x - w / 2, y - r - gap - h, x + w / 2, y - r - gap];
    case 'bottom':
      return [x - w / 2, y + r + gap, x + w / 2, y + r + gap + h];
    default: // center, without a dot
      return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
  }
}

class GridIndex {
  constructor() {
    this.cells = new Map();
  }

  *cellsOf([x0, y0, x1, y1]) {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i += 1) {
      for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j += 1) yield `${i},${j}`;
    }
  }

  hits(box) {
    for (const key of this.cellsOf(box)) {
      for (const [x0, y0, x1, y1] of this.cells.get(key) ?? []) {
        if (box[0] < x1 && box[2] > x0 && box[1] < y1 && box[3] > y0) return true;
      }
    }
    return false;
  }

  insert(box) {
    for (const key of this.cellsOf(box)) {
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(box);
    }
  }
}

const grow = ([x0, y0, x1, y1], mx, my) => [x0 - mx, y0 - my, x1 + mx, y1 + my];

/**
 * candidates: [{ id, x, y (px in the view), w, h (label size), r (dot radius, 0: no dot), positions: ['right', …] }],
 *             the most important first
 * view:       { width, height, obstacles: [[x0, y0, x1, y1]] (px, e.g. the legend) }
 * spacing:    { mx, my }: the free space kept around each label (px), gap: between dot and label
 * accept:     (candidate, placedSoFar) => whether to go on with it; placement stops at the first candidate it refuses
 * Returns [{ id, position }] of the placed ones.
 */
export function placeLabels(candidates, { width, height, obstacles = [] }, { mx = 8, my = 4, gap = 4, edge = 4 } = {}, accept = () => true) {
  const index = new GridIndex();
  for (const box of obstacles) index.insert(box);
  const placed = [];
  for (const candidate of candidates) {
    if (!accept(candidate, placed.length)) break;
    const dot = candidate.r ? [candidate.x - candidate.r, candidate.y - candidate.r, candidate.x + candidate.r, candidate.y + candidate.r] : null;
    if (dot && index.hits(grow(dot, 2, 2))) continue;
    for (const position of candidate.positions) {
      const box = boxAt(position, candidate, gap);
      if (box[0] < edge || box[1] < edge || box[2] > width - edge || box[3] > height - edge) continue;
      if (index.hits(grow(box, mx, my))) continue;
      index.insert(box);
      if (dot) index.insert(dot);
      placed.push({ id: candidate.id, position });
      break;
    }
  }
  return placed;
}
