/** @type {import('tailwindcss').Config}
 *
 *  MANUFACTURER APP — wahi rang jo agency app me chal rahe hain.
 *  Jaan-boojh kar copy kiya: ek hi firm ke do app hain, dono ek jaise dikhne
 *  chahiye. Alag rang rakhte to aadmi ko lagta ki ye kisi aur company ka
 *  software hai.
 *
 *  Teen thos rang — kabhi mila kar (gradient) mat use karna.
 */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        anjaninex: {
          red:        '#DC2626',   // pehla kaam / active line
          'red-dark': '#B91C1C',
          'red-soft': '#FEE2E2',
          navy:       '#1B2E5C',   // sidebar aur header
          'navy-dark':'#0F1E40',
          'navy-soft':'#E8ECF5',
          cream:      '#FAF7F0',   // content ka background
          'cream-2':  '#F5F1E8',
          white:      '#FFFFFF'    // cards
        },
        brand: {
          primary: '#1B2E5C',
          accent:  '#DC2626',
          light:   '#FAF7F0',
          dark:    '#0F1E40'
        }
      },
      fontFamily: {
        sans:    ['Inter', 'DM Sans', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
        mono:    ['DM Mono', 'monospace']
      },
      boxShadow: {
        brand:      '0 2px 20px rgba(27, 46, 92, 0.10)',
        'brand-lg': '0 8px 40px rgba(27, 46, 92, 0.18)'
      }
    }
  },
  plugins: []
};
