/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        border: 'var(--border)',
        'border-subtle': 'var(--border-subtle)',
        'text-primary': 'var(--text)',
        'text-muted': 'var(--text-muted)',
        'text-subtle': 'var(--text-subtle)',
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          subtle: 'var(--primary-subtle)',
        },
        accent: 'var(--accent)',
        sidebar: {
          bg: 'var(--sidebar-bg)',
          text: 'var(--sidebar-text)',
          hover: 'var(--sidebar-hover-bg)',
          active: 'var(--sidebar-active-bg)',
          divider: 'var(--sidebar-divider)',
        },
        critical: {
          DEFAULT: 'var(--critical)',
          bg: 'var(--critical-bg)',
          border: 'var(--critical-border)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          bg: 'var(--warning-bg)',
          border: 'var(--warning-border)',
        },
        success: {
          DEFAULT: 'var(--success)',
          bg: 'var(--success-bg)',
          border: 'var(--success-border)',
        },
        info: {
          DEFAULT: 'var(--info)',
          bg: 'var(--info-bg)',
          border: 'var(--info-border)',
        },
        neutral: {
          DEFAULT: 'var(--neutral)',
          bg: 'var(--neutral-bg)',
          border: 'var(--neutral-border)',
        },
        // Backwards compatibility aliases
        medguard: {
          bg: 'var(--bg)',
          card: 'var(--surface)',
          border: 'var(--border)',
          slate: 'var(--text)',
          blue: '#0B5FA5',
          'blue-light': 'var(--primary-subtle)',
          green: '#067647',
          'green-light': 'var(--success-bg)',
          red: '#B42318',
          'red-light': 'var(--critical-bg)',
          amber: '#B54708',
          'amber-light': 'var(--warning-bg)',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        lg: ['16px', '24px'],
        xl: ['18px', '26px'],
        '2xl': ['20px', '28px'],
        '3xl': ['24px', '32px'],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        lg: '10px',
        xl: '12px',
      }
    },
  },
  plugins: [],
}
