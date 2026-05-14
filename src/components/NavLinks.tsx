'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Client-side navigation: highlights the active page based on the current
 * pathname and collapses into a hamburger menu under 640px. The parent server
 * component (`TopNav`) still handles auth lookup and sign-out (which has to
 * stay a server action), and renders this between its branding and sign-out
 * controls.
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the sheet whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  return (
    <>
      {/* Desktop link bar */}
      <ul className="hidden items-center gap-1 sm:flex">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`btn-ghost ${
                  active
                    ? 'bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))] font-semibold'
                    : ''
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Mobile hamburger */}
      <button
        type="button"
        className="btn-ghost h-9 w-9 p-0 sm:hidden"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
      </button>

      {open && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 top-14 z-20 bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={() => setOpen(false)}
          />
          <ul
            role="menu"
            className="fixed inset-x-0 top-14 z-30 border-b bg-[rgb(var(--card))] p-2 shadow-md sm:hidden"
          >
            {items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    role="menuitem"
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-md px-3 py-2 text-sm hover:bg-[rgb(var(--muted))] ${
                      active
                        ? 'bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))] font-semibold'
                        : ''
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
