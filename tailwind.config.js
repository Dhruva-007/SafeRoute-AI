/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Premium backgrounds */
        bg: {
          primary: '#F6F3ED',     // main ivory
          secondary: '#EEE7DA',   // soft beige
          elevated: '#FAF7F2',    // elevated cards
          glass: 'rgba(255,255,255,0.65)',
        },

        /* Premium text */
        text: {
          primary: '#161311',     // rich charcoal black
          secondary: '#5E554B',   // muted premium brown
          muted: '#8A8075',       // soft muted
          inverse: '#FFFFFF',
        },

        /* Accent palette */
        accent: {
          primary: '#B7925A',     // champagne gold
          hover: '#A6814B',       // darker gold
          soft: '#D3B88C',        // soft warm gold
          charcoal: '#2C241C',    // premium dark
          charcoalSoft: '#3A3027',
        },

        /* Status */
        success: {
          DEFAULT: '#4C9B6E',
          soft: '#E8F4ED',
        },

        warning: {
          DEFAULT: '#D79A32',
          soft: '#FFF5E2',
        },

        danger: {
          DEFAULT: '#D64545',
          soft: '#FDECEC',
        },

        info: {
          DEFAULT: '#7D8FA8',
          soft: '#EEF3F8',
        },
      },

      borderRadius: {
        sm: '10px',
        md: '16px',
        lg: '22px',
        xl: '28px',
        card: '24px',
        btn: '18px',
      },

      boxShadow: {
        soft: '0 8px 30px rgba(44,36,28,0.08)',
        medium: '0 12px 40px rgba(44,36,28,0.12)',
        strong: '0 18px 50px rgba(44,36,28,0.16)',
        glass: '0 10px 30px rgba(44,36,28,0.06)',
        gold: '0 8px 25px rgba(183,146,90,0.20)',
      },

      backdropBlur: {
        xs: '6px',
        sm: '10px',
        md: '16px',
        lg: '24px',
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },

      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },

      animation: {
        'fade-up': 'fadeUp 0.7s ease forwards',
        'float-soft': 'floatSoft 6s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 4s ease-in-out infinite',
      },

      keyframes: {
        fadeUp: {
          '0%': {
            opacity: '0',
            transform: 'translateY(24px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },

        floatSoft: {
          '0%, 100%': {
            transform: 'translateY(0px)',
          },
          '50%': {
            transform: 'translateY(-12px)',
          },
        },

        pulseSoft: {
          '0%, 100%': {
            opacity: '0.65',
            transform: 'scale(1)',
          },
          '50%': {
            opacity: '1',
            transform: 'scale(1.04)',
          },
        },
      },

      maxWidth: {
        '8xl': '1440px',
      },
    },
  },
  plugins: [],
};