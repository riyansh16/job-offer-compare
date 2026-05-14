'use client';

import { Toaster } from 'sonner';
import { useTheme } from './ThemeProvider';

/**
 * Sonner Toaster wired to our theme provider so toast colors flip with the
 * rest of the app. Mounted once in the root layout.
 */
export function AppToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      richColors
      closeButton
      position="top-right"
      toastOptions={{
        // Use our own muted border so toasts feel like our cards.
        className: 'rounded-md',
      }}
    />
  );
}
