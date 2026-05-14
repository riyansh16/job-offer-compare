'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTheme, type ThemeChoice } from './ThemeProvider';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Three-state theme picker (System / Light / Dark). Renders as an icon button
 * that opens a small menu. Keyboard accessible: arrow keys move focus, Enter
 * or Space selects, Escape closes.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[0];
  const CurrentIcon = current.Icon;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="btn-ghost h-9 w-9 p-0"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${current.label}. Change theme.`}
        onClick={() => setOpen((v) => !v)}
      >
        <CurrentIcon size={16} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-[140px] overflow-hidden rounded-md border bg-[rgb(var(--card))] py-1 text-sm shadow-md"
        >
          {OPTIONS.map(({ value, label, Icon }) => {
            const active = value === theme;
            return (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={active}
                type="button"
                onClick={() => {
                  setTheme(value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[rgb(var(--muted))] ${
                  active ? 'font-medium' : ''
                }`}
              >
                <Icon size={14} aria-hidden />
                <span>{label}</span>
                {active && <span className="ml-auto text-[rgb(var(--muted-foreground))]">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
