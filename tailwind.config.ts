import type { Config } from 'tailwindcss';

/**
 * Deep navy grounds the page, warm earth tones carry the accents, cream breaks
 * up the white. Two semantic colours survive from the old palette because the
 * product depends on them: green separates verified data from AI estimates, red
 * marks errors and over-budget.
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        cream: '#FAF6F0',
        sand: '#F1E9DE',
        navy: '#0E1E2B',
        navy2: '#17303F',
        navy3: '#27455A',
        ink: '#0E1E2B',
        ink2: '#4A5A66',
        ink3: '#8A99A4',
        line: '#E6E0D8',
        line2: '#D2C8BA',
        terracotta: '#C05F35',
        gold: '#D9A441',
        verified: '#15803D',
        danger: '#B42318',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] },
      borderRadius: { DEFAULT: '10px', card: '16px', pill: '999px' },
      letterSpacing: { tightest: '-0.035em' },
      boxShadow: {
        card: '0 1px 2px rgba(14,30,43,.05), 0 12px 32px -18px rgba(14,30,43,.35)',
        lift: '0 2px 4px rgba(14,30,43,.06), 0 24px 48px -24px rgba(14,30,43,.45)',
      },
      maxWidth: { content: '1180px' },
    },
  },
  plugins: [],
} satisfies Config;
