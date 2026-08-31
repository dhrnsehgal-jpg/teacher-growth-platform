'use client';

import { useState } from 'react';

export function SignOutButton({ className }: { className?: string }) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setHasError(false);

    try {
      const response = await fetch('/sign-out', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
      });

      // A manual redirect is opaque in some browsers, but the sign-out route
      // intentionally answers with a 303. Do not follow it through a proxy:
      // the browser should navigate from the preview origin below.
      if (response.type !== 'opaqueredirect' && response.status !== 303 && !response.ok) {
        throw new Error(`Sign-out failed with status ${response.status}`);
      }

      window.location.assign('/sign-in');
    } catch {
      // Keep the control available so a teacher can retry after a transient
      // proxy or network failure instead of being left in a busy state.
      setIsSigningOut(false);
      setHasError(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        aria-busy={isSigningOut}
        className={className}
      >
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </button>
      {hasError && (
        <p role="alert" className="mt-2 text-meta text-destructive">
          Sign out failed. Please try again.
        </p>
      )}
    </>
  );
}
