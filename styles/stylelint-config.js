/**
 * Knurled Studio stylelint config.
 *
 * Every rule here encodes a rule from the design direction. If a design rule
 * can be linted, it is linted, and it fails the build rather than warning.
 *
 * The exceptions are narrow and expressed as values, not as file carve-outs,
 * so they cannot quietly widen:
 *   · hex colors are legal only in tokens.css
 *   · box-shadow is legal only as the chamfer focus ring
 *   · repeating-linear-gradient is legal — the knurl needs it
 *   · a 1ms duration is legal — the reduced-motion block needs it
 */

/** Chamfers, not rounded corners. Rounded reads as injection-molded plastic. */
const NO_RADIUS = '/^border(-[a-z]+)*-radius$/';

/** Never fake light: no glows, bevels, blurs, or soft edges. */
const FAKE_LIGHT = ['filter', 'backdrop-filter', '-webkit-backdrop-filter', 'text-shadow', 'mix-blend-mode'];

/**
 * Gradients paint a light source that is not there. The knurl is geometry —
 * flat repeating lines — so repeating-linear-gradient stays, and only that.
 */
const GRADIENTS = [
  'linear-gradient',
  'radial-gradient',
  'conic-gradient',
  'repeating-radial-gradient',
  'repeating-conic-gradient',
];

/** Color comes from a custom property. These bypass the token layer. */
const RAW_COLOR_FUNCTIONS = ['rgb', 'rgba', 'hsl', 'hsla'];

/** clip-path clips outline, so chamfered surfaces need this exact inset ring. */
const FOCUS_RING = '/^inset 0 0 0 3px var\\(--lavinder-600\\)$/';

/** Detent motion. Durations are tokens; 1ms is the reduced-motion escape. */
const DURATION = ['/var\\(--dur-/', '/^1ms$/'];

/** @type {import('stylelint').Config} */
export default {
  rules: {
    // ---- color must come from a token -------------------------------
    'color-no-hex': [true, { message: 'Color must come from a custom property. Raw hex belongs in tokens.css.' }],
    'color-named': ['never', { message: 'Color must come from a custom property.' }],

    // ---- chamfers, and no faked light -------------------------------
    'property-disallowed-list': [
      [NO_RADIUS, ...FAKE_LIGHT],
      {
        message: (property) =>
          /radius/.test(property)
            ? `"${property}" is not allowed. Chamfers or square edges only.`
            : `"${property}" is not allowed. Depth comes from hairline borders and flat surface steps.`,
      },
    ],

    'function-disallowed-list': [
      [...GRADIENTS, ...RAW_COLOR_FUNCTIONS, 'drop-shadow', 'blur'],
      {
        message: (fn) =>
          RAW_COLOR_FUNCTIONS.includes(fn)
            ? `"${fn}()" is not allowed. Color must come from a custom property.`
            : `"${fn}()" is not allowed. Never fake light — repeating-linear-gradient is the exception, for the knurl.`,
      },
    ],

    // ---- narrow value-level exceptions ------------------------------
    'declaration-property-value-allowed-list': [
      {
        'box-shadow': [FOCUS_RING],
        'transition-duration': DURATION,
        'animation-duration': DURATION,
      },
      {
        message: (property) =>
          property === 'box-shadow'
            ? 'box-shadow is only allowed as the chamfer focus ring: inset 0 0 0 3px var(--lavinder-600).'
            : `"${property}" must reference a --dur-* token.`,
      },
    ],

    // ---- one theme ---------------------------------------------------
    'media-feature-name-disallowed-list': [
      ['prefers-color-scheme'],
      { message: 'One theme only. There is no theme toggle.' },
    ],
  },

  overrides: [
    {
      // The one place raw hex is the point: it is where color is defined.
      files: ['**/tokens.css'],
      rules: {
        'color-no-hex': null,
      },
    },
  ],
};
