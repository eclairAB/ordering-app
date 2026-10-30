export interface PlaceholderOptions {
  title: string;
  subtitle: string;
  emoji: string;
  /** Two hex colours for the background gradient. */
  colors: [string, string];
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A self-contained 4:3 SVG placeholder. No external fonts or images (works offline). */
export function placeholderSvg({ title, subtitle, emoji, colors: [from, to] }: PlaceholderOptions): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <circle cx="650" cy="110" r="190" fill="#fff" fill-opacity="0.08"/>
  <circle cx="120" cy="560" r="160" fill="#000" fill-opacity="0.06"/>
  <text x="400" y="300" font-size="200" text-anchor="middle" dominant-baseline="central">${emoji}</text>
  <text x="400" y="500" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="44" font-weight="700" fill="#fff" text-anchor="middle">${escapeXml(title)}</text>
  <text x="400" y="550" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="24" fill="#fff" fill-opacity="0.8" text-anchor="middle" letter-spacing="4">${escapeXml(subtitle.toUpperCase())}</text>
</svg>
`;
}
