/** @type {import('tailwindcss').Config}
 *
 *  ANJANINEX BRAND PALETTE
 *  Logo-derived, SOLID COLORS ONLY — never blend or gradient these.
 *  Use as flat blocks: red for primary actions, navy for headers/structure,
 *  cream for backgrounds, white for cards.
 */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // ============================================================
        // ANJANINEX BRAND — 3 solid colors, no blending
        // ============================================================
        // THEMEABLE: ab CSS variables se aate hain (styles.css me 5 themes define hain).
        // rgb(var / <alpha-value>) format se bg-anjaninex-navy/70 jaisi opacity classes bhi chalti hain.
        anjaninex: {
          red:        'rgb(var(--ax-red-rgb) / <alpha-value>)',
          'red-dark': 'rgb(var(--ax-red-dark-rgb) / <alpha-value>)',
          'red-soft': 'rgb(var(--ax-red-soft-rgb) / <alpha-value>)',
          navy:       'rgb(var(--ax-navy-rgb) / <alpha-value>)',
          'navy-dark':'rgb(var(--ax-navy-dark-rgb) / <alpha-value>)',
          'navy-soft':'rgb(var(--ax-navy-soft-rgb) / <alpha-value>)',
          cream:      'rgb(var(--ax-cream-rgb) / <alpha-value>)',
          'cream-2':  'rgb(var(--ax-cream2-rgb) / <alpha-value>)',
          white:      '#FFFFFF'   // cards
        },

        // Brand alias so existing class names keep working but resolve to navy
        brand: {
          primary: '#1B2E5C',
          accent:  '#DC2626',
          light:   '#FAF7F0',
          dark:    '#0F1E40'
        },

        // Role chips — kept distinct but tuned to red/navy family
        role: {
          superadmin: '#0F1E40',  // navy-dark
          admin:      '#1B2E5C',  // navy
          hr:         '#DC2626',  // red
          srmgr:      '#B91C1C',  // red-dark
          mgr:        '#3B5998',  // navy mid
          staff:      '#6B7280'   // neutral grey for general staff
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace']
      },
      boxShadow: {
        brand:      '0 2px 20px rgba(27, 46, 92, 0.10)',
        'brand-lg': '0 8px 40px rgba(27, 46, 92, 0.18)',
        'red-glow': '0 4px 14px rgba(220, 38, 38, 0.30)'
      },
      backgroundImage: {
        // SOLID striped pattern, no smooth gradient — keeps colors distinct
        'anjaninex-stripes': 'linear-gradient(90deg, #DC2626 0%, #DC2626 50%, #1B2E5C 50%, #1B2E5C 100%)'
      }
    }
  },
  plugins: []
};
