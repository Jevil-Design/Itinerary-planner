import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Contour — plan the whole trip in minutes',
  description:
    'Give it a source, a destination and dates. Contour builds the route, the day-by-day schedule, what to pack and what it costs — and stores none of it.',
  openGraph: {
    title: 'Contour — plan the whole trip in minutes',
    description:
      'Three fields in, a full day-by-day plan out. Nothing is stored on a server.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans text-[15px] leading-relaxed">{children}</body>
    </html>
  );
}
