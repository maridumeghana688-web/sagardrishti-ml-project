/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Existing Phase-1 tokens (kept for Dashboard/Status compatibility)
        ocean: {
          50: '#eef7ff',
          100: '#d9edff',
          500: '#0e7cc4',
          700: '#0b5a8e',
          900: '#082f47',
        },
        // SAGARDRISHTI cinematic identity
        ink: '#031B2E', // Deep Ocean Navy
        maritime: '#075985', // Maritime Blue
        abyss: '#0E7490', // Ocean Blue
        intel: '#22D3EE', // Cyan Intelligence
        ice: '#F5FAFC', // Ice White
        mist: '#94A3B8', // Muted Blue Gray
        signal: '#F59E0B', // Warning Amber
        critical: '#EF4444', // Critical Red
        sand: '#E9DCC3', // Warm neutral
        paper: '#F4F9FC', // Frosted panel white
      },
      fontFamily: {
        display: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
