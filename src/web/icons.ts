/**
 * Toolbar icons: 24×24 line drawings in the current text colour. Actions
 * everyone recognises (save, print, undo…) are icons only; the workbenches
 * and menus have an icon too, shown beside or instead of their name as the
 * Buttons setting says (design-v0.3 §8).
 */
export const ICONS = {
  projects: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  settings:
    '<path d="M4 7h9M17 7h3M15 5v4M4 12h3M11 12h9M9 10v4M4 17h11M19 17h1M17 15v4"/>',
  saveAs: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><path d="M8 20v-6h8v6"/>',
  pdf: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 10v7M9 14l3 3 3-3"/>',
  print: '<path d="M7 9V4h10v5"/><path d="M7 17H4v-7h16v7h-3"/><path d="M7 14h10v6H7z"/>',
  undo: '<path d="M9 6l-5 5 5 5"/><path d="M4 11h10a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 6l5 5-5 5"/><path d="M20 11H10a5 5 0 0 0 0 10h3"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="8" y="8" width="8" height="8"/>',
  split: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14"/>',
  // A tile split right and down (design-v0.3 §7): the new half shaded.
  splitRight: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14"/><path d="M15 9h3M16.5 7.5v3"/>',
  splitDown: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 12h18"/><path d="M10.5 15.5h3M12 14v3"/>',
  colours: '<path d="M4 7h16" stroke-width="3"/><path d="M4 12h16" stroke-dasharray="3 2" stroke-width="3"/><path d="M4 17h16" stroke-width="3"/>',
  select: '<path d="M6 3l12 9-5.5 1L10 19z"/>',
  wire: '<path d="M4 18h5V7h11"/><circle cx="4" cy="18" r="1.6"/><circle cx="20" cy="7" r="1.6"/>',
  table: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 14.5h18M9 5v14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.8"/><path d="M12 17v.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  collapse: '<path d="M11 6l-6 6 6 6M19 6l-6 6 6 6"/>',
  expand: '<path d="M13 6l6 6-6 6M5 6l6 6-6 6"/>',
  minimise: '<path d="M6 12h12"/>',
  restore: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>',
  section: '<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2"/>',
  cloud:
    '<path d="M7 18a3 3 0 0 1-.5-6 4 4 0 0 1 7.7-2A3.5 3.5 0 0 1 18 13.5a2.5 2.5 0 0 1-.5 4.5z"/>',
  picture: '<rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  rail: '<path d="M3 10h18M3 14h18"/><path d="M6 10v4M10 10v4M14 10v4M18 10v4"/>',
  trunking: '<rect x="3" y="8" width="18" height="8"/><path d="M6 8v8M9 8v8M12 8v8M15 8v8M18 8v8"/>',
  dimension: '<path d="M4 7v10M20 7v10M4 12h16"/><path d="M3 13l2-2M19 13l2-2"/>',
  plate: '<rect x="3" y="8" width="18" height="8" rx="1"/><rect x="5" y="10" width="14" height="4"/>',
  note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/><path d="M8 9h8M8 12.5h5"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="M16 5l3.5-1 3 15.5-3.5 1z"/>',
  // Workbenches and menus (design-v0.3 §8).
  draft: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  annotate: '<path d="M5 6h10M10 6v11"/><path d="M14 13h6M14 17h6M5 20h15"/>',
  ga: '<rect x="4" y="3" width="16" height="18" rx="1"/><circle cx="9" cy="8" r="1.5"/><circle cx="15" cy="8" r="1.5"/><path d="M8 13h8M8 16h8M17 11v2"/>',
  simulate: '<path d="M7 4l12 8-12 8z"/>',
  renumber: '<path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/>',
  templates: '<rect x="7" y="3" width="13" height="15" rx="1"/><path d="M4 7v14h12"/><path d="M10 8h7M10 11h7M10 14h4"/>',
  plant: '<circle cx="12" cy="12" r="8"/><path d="M12 12l-2-5M12 12l5 2M12 12l-3 4"/><circle cx="12" cy="12" r="1"/>',
  controllers: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 7h14M5 17h14"/><path d="M8 20v1M11 20v1M14 20v1M17 20v1"/><path d="M9 10h2M9 13h2M13 10h2M13 13h2"/>',
  distribution: '<path d="M3 6h18" stroke-width="3"/><path d="M7 6v12M12 6v12M17 6v12"/><circle cx="7" cy="6" r="1"/><circle cx="12" cy="6" r="1"/><circle cx="17" cy="6" r="1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9"/>',
  expectations: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11"/><circle cx="5" cy="18" r="1.4"/>',
  schedules: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  place: '<rect x="4" y="12" width="16" height="8" rx="1"/><path d="M12 3v8M8.5 7.5L12 11l3.5-3.5"/>',
  devices: '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11"/><path d="M9 8h5"/>',
  project: '<path d="M4 4h16v16H4z"/><path d="M4 15h16M11 15v5M15 15v5"/>',
  // Alignment (design-v0.3 §5): the line aligned to, and two bodies of different sizes.
  alignLeft: '<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4"/><rect x="7" y="14" width="7" height="4"/>',
  alignCentre: '<path d="M12 3v18" stroke-dasharray="2 2"/><rect x="5" y="6" width="14" height="4"/><rect x="8" y="14" width="8" height="4"/>',
  alignRight: '<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4"/><rect x="10" y="14" width="7" height="4"/>',
  alignTop: '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12"/><rect x="14" y="7" width="4" height="7"/>',
  alignMiddle: '<path d="M3 12h18" stroke-dasharray="2 2"/><rect x="6" y="5" width="4" height="14"/><rect x="14" y="8" width="4" height="8"/>',
  alignBottom: '<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12"/><rect x="14" y="10" width="4" height="7"/>',
  distributeAcross: '<path d="M3 4v16M21 4v16"/><rect x="6" y="8" width="3" height="8"/><rect x="11" y="6" width="3" height="12"/><rect x="16" y="9" width="2" height="6"/>',
  distributeDown: '<path d="M4 3h16M4 21h16"/><rect x="8" y="6" width="8" height="3"/><rect x="6" y="11" width="12" height="3"/><rect x="9" y="16" width="6" height="2"/>',
} as const;

export type IconName = keyof typeof ICONS;
