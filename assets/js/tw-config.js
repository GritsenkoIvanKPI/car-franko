// Shared Tailwind (CDN) theme: brand colours, fonts, layout width
tailwind.config = {
      theme: {
        extend: {
          colors: {
            ink: { DEFAULT: '#141413', 900: '#0F0F0E', 800: '#1C1B1A', 700: '#232220', 600: '#2C2B29' },
            brand: { DEFAULT: '#236859', 600: '#1C5549', 400: '#2E8571', 300: '#4DB89A', 200: '#8FD6C1' },
            fog: { DEFAULT: '#F2F1EE', 300: '#C9C7C2', 400: '#9C9A95', 500: '#76746F' },
          },
          fontFamily: {
            display: ['Jost', 'system-ui', 'sans-serif'],
            sans: ['Manrope', 'system-ui', 'sans-serif'],
          },
          maxWidth: { shell: '1320px' },
        },
      },
    };
