import type { Config } from 'tailwindcss';

// Mirrors the minimal palette the prototype settled on: white, ink, grey rules,
// one green for verified and one red for errors.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        surf: '#FAFAFA',
        surf2: '#F4F4F4',
        line: '#E7E7E7',
        line2: '#D0D0D0',
        ink: '#171717',
        ink2: '#565656',
        ink3: '#9A9A9A',
        verified: '#15803D',
        danger: '#B42318',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] },
      borderRadius: { DEFAULT: '4px' },
    },
  },
  plugins: [],
} satisfies Config;
