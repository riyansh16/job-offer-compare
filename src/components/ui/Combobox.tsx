'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  /** Currently selected value (controlled). */
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  /** Hidden form field name so the value is submitted with the form. */
  name?: string;
  required?: boolean;
  /** Mark invalid (red border) and announce via aria-invalid. */
  error?: boolean;
  /** id of an element describing the field (error text, hint). */
  describedBy?: string;
  id?: string;
  className?: string;
}

/**
 * Searchable typeahead combobox. Keyboard accessible: arrow keys navigate,
 * Enter selects, Escape closes, typing filters by case-insensitive substring.
 * Backed by a hidden input so it slots into existing FormData server-action
 * flows without rewriting the parent form.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  name,
  required,
  error,
  describedBy,
  id,
  className = '',
}: ComboboxProps) {
  const reactId = useId();
  const inputId = id ?? `combobox-${reactId}`;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Clamp activeIndex when filtered shrinks.
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function pick(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
    setQuery('');
    // Restore focus to the trigger for keyboard users.
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        pick(filtered[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery('');
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        type="button"
        id={inputId}
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((v) => !v)}
        className={`input flex items-center justify-between text-left ${error ? 'input-error' : ''}`}
      >
        <span className={selected ? '' : 'text-[rgb(var(--muted-foreground))]'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown size={14} aria-hidden className="text-[rgb(var(--muted-foreground))]" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-md border bg-[rgb(var(--card))] shadow-md">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search size={14} aria-hidden className="text-[rgb(var(--muted-foreground))]" />
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm focus:outline-none"
              aria-autocomplete="list"
              aria-controls={listId}
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            className="max-h-64 overflow-y-auto py-1 text-sm"
            aria-label="Options"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-[rgb(var(--muted-foreground))]">
                No matches
              </li>
            )}
            {filtered.map((o, i) => {
              const isActive = i === activeIndex;
              const isSelected = o.value === value;
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    // Use mousedown so we beat the document onClick that closes the menu.
                    e.preventDefault();
                    pick(o);
                  }}
                  className={`flex cursor-pointer items-center justify-between px-3 py-1.5 ${
                    isActive ? 'bg-[rgb(var(--muted))]' : ''
                  } ${isSelected ? 'font-medium' : ''}`}
                >
                  <span>{o.label}</span>
                  {isSelected && (
                    <Check size={14} aria-hidden className="text-[rgb(var(--primary))]" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
