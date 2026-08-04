/** @type {import('tailwindcss').Config}
 *
 *  MANUFACTURER APP — brand palette
 *  Agency app ke saath ek hi parivaar ka rang, par heading ka purple wahi
 *  Vyapaar Setu wala rakha (#5c1a8b) taaki dono app ek hi ghar ke lagen.
 */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#5c1a8b',   // heading
          muted:  '#6b3fa0',   // halka text
          navy:   '#1B2E5C',
          bad:    '#DC2626',
          warn:   '#a2700d',
          ok:     '#2f6b3a',
          line:   '#e8e2f0',
          bg:     '#f7f4fb'
        }
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace']
      }
    }
  },
  plugins: []
};
