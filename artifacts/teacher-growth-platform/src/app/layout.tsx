import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  // Twenty-five routes shared one title, which tells a screen-reader user
  // nothing about where they have landed (WCAG 2.4.2). Each page now sets its
  // own; this template keeps the product name on the end of all of them.
  title: {
    default: 'Teacher Professional Growth Platform',
    template: '%s · Teacher Growth',
  },
  description:
    'Competency, KPI, CPD, appraisal and career progression for CBSE-affiliated schools.',
  // Staff professional records must not be indexed under any circumstances.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
