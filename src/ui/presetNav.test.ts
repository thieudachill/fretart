import { describe, expect, it } from 'vitest';
import { filterShelves, flatten, moveSelection, PresetNav, type Shelves } from './presetNav';

const shelves: Shelves = {
  'Line & Shape': ['Line Drawing', 'Wavy Ink'],
  'Print & Paper': ['Print Window', 'Blueprint Pyramid'],
  'Motion & Light': ['Blueprint'],
};

describe('filterShelves', () => {
  it('returns everything for an empty query', () => {
    expect(filterShelves(shelves, '')).toEqual(shelves);
    expect(filterShelves(shelves, '   ')).toEqual(shelves);
  });

  it('matches name substrings case-insensitively', () => {
    expect(filterShelves(shelves, 'blue')).toEqual({
      'Print & Paper': ['Blueprint Pyramid'],
      'Motion & Light': ['Blueprint'],
    });
  });

  it('drops categories with no matches and keeps category order', () => {
    const out = filterShelves(shelves, 'ink');
    expect(Object.keys(out)).toEqual(['Line & Shape']);
    expect(out['Line & Shape']).toEqual(['Wavy Ink']);
  });
});

describe('flatten', () => {
  it('lists presets category-major in shelf order', () => {
    expect(flatten(shelves)).toEqual([
      { category: 'Line & Shape', name: 'Line Drawing' },
      { category: 'Line & Shape', name: 'Wavy Ink' },
      { category: 'Print & Paper', name: 'Print Window' },
      { category: 'Print & Paper', name: 'Blueprint Pyramid' },
      { category: 'Motion & Light', name: 'Blueprint' },
    ]);
  });
});

describe('moveSelection', () => {
  it('wraps at both ends', () => {
    expect(moveSelection(4, 1, 5)).toBe(0);
    expect(moveSelection(0, -1, 5)).toBe(4);
    expect(moveSelection(2, 1, 5)).toBe(3);
  });

  it('enters the list from "nothing selected" at the near end', () => {
    expect(moveSelection(-1, 1, 5)).toBe(0);
    expect(moveSelection(-1, -1, 5)).toBe(4);
  });

  it('returns -1 for an empty list', () => {
    expect(moveSelection(0, 1, 0)).toBe(-1);
  });
});

describe('PresetNav', () => {
  it('starts on the first category and cycles with wrap in both directions', () => {
    const nav = new PresetNav(() => shelves);
    expect(nav.category).toBe('Line & Shape');
    expect(nav.cycleCategory(1)).toBe('Print & Paper');
    expect(nav.cycleCategory(1)).toBe('Motion & Light');
    expect(nav.cycleCategory(1)).toBe('Line & Shape');
    expect(nav.cycleCategory(-1)).toBe('Motion & Light');
  });

  it('picks 1-based slots within the current category, null out of range', () => {
    const nav = new PresetNav(() => shelves);
    expect(nav.pick(1)).toBe('Line Drawing');
    expect(nav.pick(2)).toBe('Wavy Ink');
    expect(nav.pick(3)).toBeNull();
    nav.cycleCategory(1);
    expect(nav.pick(2)).toBe('Blueprint Pyramid');
  });

  it('syncTo moves the category pointer to the shelf holding that preset', () => {
    const nav = new PresetNav(() => shelves);
    nav.syncTo('Blueprint');
    expect(nav.category).toBe('Motion & Light');
    expect(nav.pick(1)).toBe('Blueprint');
    nav.syncTo('no such preset'); // unknown name: pointer stays put
    expect(nav.category).toBe('Motion & Light');
  });

  it('reads shelves fresh each call so new user saves appear immediately', () => {
    let current: Shelves = { 'Line & Shape': ['Line Drawing'] };
    const nav = new PresetNav(() => current);
    expect(nav.pick(2)).toBeNull();
    current = { 'Line & Shape': ['Line Drawing', 'My Save'] };
    expect(nav.pick(2)).toBe('My Save');
  });

  it('survives an empty shelf set', () => {
    const nav = new PresetNav(() => ({}));
    expect(nav.category).toBeNull();
    expect(nav.cycleCategory(1)).toBeNull();
    expect(nav.pick(1)).toBeNull();
  });
});
