// @ts-check
/**
 * Stryker mutation testing configuration.
 *
 * Runs against the unit tests (vitest.config.ts). types.ts has no runtime code.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  coverageAnalysis: 'perTest',
  reporters: ['html', 'clear-text', 'progress'],
  mutate: ['src/**/*.ts', '!src/types.ts', '!src/index.ts'],
  // `break` is left off so a run never fails CI by itself; this is a
  // quality signal run on demand, not a required check.
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
};
