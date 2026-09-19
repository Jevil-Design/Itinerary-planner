import type { Metadata } from 'next';
import { StackProvider, StackTheme } from '@stackframe/stack';
import { stackServerApp } from '@/stack';
import './globals.css';

export const metadata: Metadata = {
  title: 'Contour — AI Travel Itinerary Builder',
  description:
    'Give it a source, a destination and dates. Contour builds the route, the day-by-day schedule, stays, food, budget and packing list, and keeps it on every device.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans text-[15px] leading-relaxed">
        <StackProvider app={stackServerApp}>
          <StackTheme>{children}</StackTheme>
        </StackProvider>
      </body>
    </html>
  );
}
