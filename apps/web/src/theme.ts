import { color, fontSize, radius, spacing } from '@farm/design-tokens';

/**
 * Publishes design tokens as CSS variables so stylesheets and components
 * share one source of truth with design tokens.
 */
export function applyTheme(): void {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(color)) {
    root.setProperty(`--color-${kebab(name)}`, value);
  }
  for (const [name, value] of Object.entries(spacing)) {
    root.setProperty(`--space-${name}`, `${value}px`);
  }
  for (const [name, value] of Object.entries(radius)) {
    root.setProperty(`--radius-${name}`, `${value}px`);
  }
  for (const [name, value] of Object.entries(fontSize)) {
    root.setProperty(`--font-${name}`, `${value}px`);
  }
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
