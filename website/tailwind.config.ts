import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        olive: {
          950: '#0f1208',
          900: '#1a1f0e',
          800: '#2D3319',
          700: '#3d4522',
          600: '#4f5a2c',
          400: '#8a9a52',
        },
        cream: {
          DEFAULT: '#F5F0E8',
          50: '#FAF8F4',
          100: '#F5F0E8',
          200: '#EDE4D4',
        },
        brass: {
          DEFAULT: '#C9A84C',
          light: '#E4C97A',
          dark: '#9A7A2E',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Josefin Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
