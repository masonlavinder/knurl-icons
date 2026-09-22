import knurled from './vendor/knurled-kit/stylelint-config.js';

/**
 * The studio's design rules, enforced here for the same reason they are
 * enforced there: a banned border-radius should fail the build, not ship.
 *
 * The config is a verbatim mirror (see scripts/sync-kit.mjs), so every change
 * below is expressed here rather than by editing it. There are three, and each
 * one tracks a deviation already argued for in src/brand/instrument.css:
 *
 *   · instrument.css is this app's tokens.css — it is where colour is defined,
 *     so raw hex is the point there and banned everywhere else.
 *   · the focus ring reads --focus-ring rather than --lavinder-600, because
 *     the accent has to step up the ramp to stay legible on charcoal.
 *   · vendor/ is upstream's code and is linted upstream.
 */
export default {
  ...knurled,
  ignoreFiles: ['vendor/**', 'dist/**'],
  overrides: [
    ...(knurled.overrides ?? []),
    {
      files: ['src/brand/instrument.css'],
      rules: {
        'color-no-hex': null,
        // The ring colour is a token here; upstream's literal is the only
        // value its own rule admits.
        'declaration-property-value-allowed-list': [
          {
            'box-shadow': ['/^inset 0 0 0 3px var\\(--focus-ring\\)$/'],
            'transition-duration': ['/var\\(--dur-/', '/^1ms$/'],
            'animation-duration': ['/var\\(--dur-/', '/^1ms$/'],
          },
        ],
      },
    },
    {
      files: ['src/**/*.css'],
      rules: {
        'declaration-property-value-allowed-list': [
          {
            'box-shadow': ['/^inset 0 0 0 3px var\\(--focus-ring\\)$/'],
            'transition-duration': ['/var\\(--dur-/', '/^1ms$/'],
            'animation-duration': ['/var\\(--dur-/', '/^1ms$/'],
          },
          {
            message: (property) =>
              property === 'box-shadow'
                ? 'box-shadow is only allowed as the chamfer focus ring: inset 0 0 0 3px var(--focus-ring).'
                : `"${property}" must reference a --dur-* token.`,
          },
        ],
      },
    },
  ],
};
