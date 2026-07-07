/**
 * Pure keyboard/search navigation over preset shelves (PresetStore.byCategory
 * output). The performance bar consumes this: `[`/`]` cycle the category,
 * digits 1–9 pick within it, the popover filters and arrow-walks the flat
 * list. No DOM here — everything is unit-tested.
 */
export type Shelves = Partial<Record<string, string[]>>;

export interface PresetRef {
  category: string;
  name: string;
}

/** Case-insensitive substring filter; empty query passes everything through. */
export function filterShelves(shelves: Shelves, query: string): Shelves {
  const q = query.trim().toLowerCase();
  if (!q) return shelves;
  const out: Shelves = {};
  for (const [category, names] of Object.entries(shelves)) {
    const hits = (names ?? []).filter((n) => n.toLowerCase().includes(q));
    if (hits.length) out[category] = hits;
  }
  return out;
}

/** Category-major flat list — the popover's walk order. */
export function flatten(shelves: Shelves): PresetRef[] {
  const out: PresetRef[] = [];
  for (const [category, names] of Object.entries(shelves)) {
    for (const name of names ?? []) out.push({ category, name });
  }
  return out;
}

/** Wrapping selection step; -1 means "nothing selected" and enters at the near end. */
export function moveSelection(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return (((current + delta) % length) + length) % length;
}

export class PresetNav {
  private catIndex = 0;

  /** Shelves are read fresh every call so new user saves appear immediately. */
  constructor(private shelves: () => Shelves) {}

  private categories(): string[] {
    return Object.keys(this.shelves());
  }

  get category(): string | null {
    const cats = this.categories();
    if (!cats.length) return null;
    this.catIndex = Math.min(this.catIndex, cats.length - 1);
    return cats[this.catIndex];
  }

  cycleCategory(dir: 1 | -1): string | null {
    const cats = this.categories();
    if (!cats.length) return null;
    this.catIndex = (((this.catIndex + dir) % cats.length) + cats.length) % cats.length;
    return cats[this.catIndex];
  }

  /** 1-based slot within the current category (the 1–9 hotkeys). */
  pick(slot: number): string | null {
    const cat = this.category;
    if (!cat) return null;
    return this.shelves()[cat]?.[slot - 1] ?? null;
  }

  /** Point the category at wherever `name` lives (after a popover load). */
  syncTo(name: string): void {
    const cats = Object.entries(this.shelves());
    const i = cats.findIndex(([, names]) => names?.includes(name));
    if (i >= 0) this.catIndex = i;
  }
}
