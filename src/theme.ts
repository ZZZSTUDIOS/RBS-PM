export const theme = {
  colors: {
    // Backgrounds
    pageBg: '#0a0a0a',
    headerBg: '#0a0a0a',
    sidebarBg: '#0a0a0a',
    cardBg: '#111111',
    cardBgLight: '#161616',
    inputBg: '#0e0e0e',
    black: '#000',
    modalOverlay: 'rgba(0, 0, 0, 0.9)',

    // Primary (white — monochrome dashboard)
    primary: '#e8e8e8',
    primaryDark: '#141414',
    primaryBgMuted: '#111',

    // Warning (muted amber for secondary indicators)
    warning: '#d4a03c',
    warningDark: '#141008',

    // Error (red for negative deltas)
    error: '#d94444',
    errorLight: '#e06060',
    errorDark: '#140a0a',
    errorBgDark: '#140808',
    errorBorder: '#201010',

    // Info (dim gray)
    info: '#888',
    infoDark: '#141414',

    // Highlight (green — only for positive indicators)
    highlight: '#4caf50',
    highlightDark: '#0e140e',
    highlightMuted: '#3d8b40',
    highlightBorder: '#1a261a',
    highlightBgLight: '#0e120e',

    // Success (green)
    success: '#4caf50',
    successDark: '#0e140e',

    // Text
    textWhite: '#f0f0f0',
    textLight: '#d8d8d8',
    textBody: '#b0b0b0',
    textMuted: '#707070',
    textMutedAlt: '#606060',
    textDim: '#484848',
    textDisabled: '#2a2a2a',
    textSubtle: '#808080',

    // Borders
    border: '#1e1e1e',
    borderLight: '#181818',
    borderDim: '#141414',
  },

  fonts: {
    primary: "'Helvetica World', 'Helvetica Neue', Helvetica, Arial, sans-serif",
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
