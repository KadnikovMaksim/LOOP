/**
 * Compact inline SVG glyphs for map markers.
 * Rendered inside Leaflet DivIcons, so they must be plain SVG strings.
 */

const SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

const GLYPHS: Record<string, string> = {
  // Tree: crown + trunk
  park: `<path d="M12 3 6.5 12H9.5L5 18H19L14.5 12H17.5Z"/><path d="M12 18v3"/>`,

  // Classical museum building
  museum: `<path d="M3 9 12 3l9 6"/><path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9"/><path d="M3 21h18"/>`,

  // Obelisk monument on a base
  monument: `<path d="M12 2 9.5 8h5L12 2Z"/><path d="M10 8v10h4V8"/><path d="M7.5 18h9M6.5 21h11"/>`,

  // Mountains / viewpoint
  scenic: `<path d="M2 20 9 7l5 8 3-4 5 9H2Z"/>`,

  // Coffee cup
  cafe: `<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M7 4v1.5M11 3v2.5"/>`,

  // Gem
  hidden_gem: `<path d="M12 2 21 10 12 22 3 10Z"/><path d="M3 10h18"/>`,

  // Camera for user submissions
  camera: `<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>`,
};

export function categoryGlyph(category: string, size: number): string {
  const body = GLYPHS[category] ?? GLYPHS.hidden_gem;
  return `<svg ${SVG_ATTRS} width="${size}" height="${size}">${body}</svg>`;
}
