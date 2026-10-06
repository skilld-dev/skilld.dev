export default {
  ui: {
    colors: {
      primary: 'rose',
      neutral: 'stone',
    },
    button: {
      slots: {
        base: 'font-mono',
      },
      defaultVariants: {
        color: 'primary',
        variant: 'solid',
      },
    },
    card: {
      slots: {
        root: 'rounded-lg border border-default transition-colors duration-200',
        header: 'p-4',
        body: 'p-4',
      },
      variants: {
        variant: {
          outline: {
            root: 'hover:border-[var(--ui-text-muted)]',
          },
        },
      },
    },
    badge: {
      slots: {
        base: 'font-mono',
      },
      defaultVariants: {
        variant: 'subtle',
        size: 'xs',
      },
    },
    input: {
      defaultVariants: {
        variant: 'outline',
      },
    },
    prose: {
      pre: {
        slots: {
          // The copy button sits over the first line, so long commands that wrap keep clear of it.
          base: 'pe-12',
        },
      },
    },
  },
}
