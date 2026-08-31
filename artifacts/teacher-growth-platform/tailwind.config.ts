import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1200px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        // Reserved for verification states: unverified regulatory items must be
        // visually distinct from verified ones everywhere they appear.
        caution: {
          DEFAULT: 'hsl(var(--caution))',
          foreground: 'hsl(var(--caution-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: 'var(--radius-card)',
        button: 'var(--radius-button)',
        pill: 'var(--radius-pill)',
      },
      spacing: {
        page: 'var(--space-page)',
        section: 'var(--space-section)',
        card: 'var(--space-card)',
      },
      fontSize: {
        hero: ['var(--text-hero)', { lineHeight: '1.2', letterSpacing: '-0.025em' }],
        title: ['var(--text-title)', { lineHeight: '1.4' }],
        body: ['var(--text-body)', { lineHeight: '1.5' }],
        meta: ['var(--text-meta)', { lineHeight: '1.5' }],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        elevated: 'var(--shadow-elevated)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;