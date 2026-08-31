import { redirect } from 'next/navigation';

export const metadata = { title: 'Home' };

/**
 * The root sends people to their dashboard. Unauthenticated visitors are
 * redirected to sign-in by the middleware before reaching here.
 */
export default function Home() {
  redirect('/dashboard');
}
