export const theme = {
  colors: {
    // Backgrounds
    pageBg: '#0a0a0a',
    headerBg: '#000',
    sidebarBg: '#050505',
    cardBg: '#111',
    cardBgLight: '#1a1a1a',
    inputBg: '#0d0d0d',
    black: '#000',
    modalOverlay: 'rgba(0, 0, 0, 0.9)',

    // Primary (green)
    primary: '#00ff00',
    primaryDark: '#001a00',
    primaryBgMuted: '#0a1a0a',

    // Warning (orange)
    warning: '#ff6600',
    warningDark: '#1a0a00',

    // Error (red)
    error: '#ff0000',
    errorLight: '#ff6666',
    errorDark: '#1a0a0a',
    errorBgDark: '#1a0000',
    errorBorder: '#330000',

    // Info (cyan)
    info: '#00ffff',
    infoDark: '#001a1a',

    // Highlight (yellow)
    highlight: '#ffff00',
    highlightDark: '#1a1a00',
    highlightMuted: '#cccc00',
    highlightBorder: '#333300',
    highlightBgLight: '#1a1a0a',

    // Success
    success: '#0f5132',
    successDark: '#0d1a0d',

    // Text
    textWhite: '#fff',
    textLight: '#e0e0e0',
    textBody: '#ccc',
    textMuted: '#999',
    textMutedAlt: '#888',
    textDim: '#666',
    textDisabled: '#444',
    textSubtle: '#aaa',

    // Borders
    border: '#333',
    borderLight: '#222',
    borderDim: '#1a1a1a',
  },

  fonts: {
    mono: "'IBM Plex Mono', 'Courier New', monospace",
  },

  fontSizes: {
    heroTitle: '36px',
    displayLg: '32px',
    displayMd: '28px',
    sectionTitle: '24px',
    displaySm: '20px',
    title: '18px',
    subtitle: '16px',
    nav: '14px',
    body: '13px',
    small: '12px',
    xs: '11px',
    xxs: '10px',
    tiny: '9px',
  },
} as const;
