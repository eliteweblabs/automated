import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

const customConfig = defineConfig({
  globalCss: {
    'html, body': {
      bg: 'app.bg',
      color: 'app.snow',
    },
    button: {
      borderRadius: 'var(--chakra-radii-sm) !important',
    },
    'input, textarea, select': {
      borderRadius: 'var(--chakra-radii-sm) !important',
    },
  },
  theme: {
    tokens: {
      colors: {
        black: {
          value: '#0C0C0C',
        },
        white: {
          value: '#F1F1F1',
        },
        primary: {
          50: { value: '#F4EFFF' },
          100: { value: '#E4D7FF' },
          200: { value: '#D4BEFF' },
          300: { value: '#BC97FF' },
          400: { value: '#9F68FF' },
          500: { value: '#792BF8' },
          600: { value: '#7756C4' },
          700: { value: '#5D3FA5' },
          800: { value: '#3E2C69' },
          900: { value: '#271B42' },
        },
        gray: {
          50: { value: '#F7F7F7' },
          100: { value: '#EFEFEF' },
          200: { value: '#E4E4E4' },
          300: { value: '#D1D1D1' },
          400: { value: '#B0B0B0' },
          500: { value: '#8A8A8A' },
          600: { value: '#666666' },
          700: { value: '#4B4B4B' },
          800: { value: '#2E2E2E' },
          900: { value: '#141414' },
        },
        app: {
          snow: { value: '#0C0C0C' },
          muted: { value: '#5F5F5F' },
          primary: { value: '#792BF8' },
          primaryAlt: { value: '#7756C4' },
          onPrimary: { value: '#F1F1F1' },
          bg: { value: '#FFFFFF' },
          bgAlt: { value: '#FFFFFF' },
          border: { value: '#A5A5A5' },
        },
      },
      fonts: {
        body: {
          value:
            'var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        heading: {
          value:
            'var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        mono: {
          value:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        },
      },
      radii: {
        none: { value: '0px' },
        sm: { value: '4px' },
        md: { value: '4px' },
        lg: { value: '4px' },
        xl: { value: '4px' },
        '2xl': { value: '4px' },
        full: { value: '9999px' },
      },
      shadows: {
        sm: { value: 'none' },
        md: { value: 'none' },
        lg: { value: 'none' },
        xl: { value: 'none' },
        '2xl': { value: 'none' },
      },
    },
    semanticTokens: {
      colors: {
        'chakra-body-bg': {
          value: '{colors.app.bg}',
        },
        'chakra-body-text': {
          value: '{colors.app.snow}',
        },
        'chakra-border-color': {
          value: '{colors.app.border}',
        },
        'chakra-subtle-bg': {
          value: '{colors.gray.50}',
        },
        'chakra-subtle-text': {
          value: '{colors.gray.700}',
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, customConfig);
