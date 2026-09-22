import type { Address } from './model/types.ts';

export type Severity = 'error' | 'warn' | 'info';

/**
 * Every pipeline stage and lint rule emits these. The review UI is a list you
 * can click to select the offending geometry on canvas -- which is the whole
 * reason the pipeline is staged rather than a monolith.
 */
export type Diagnostic = {
  code: string;
  severity: Severity;
  message: string;
  addrs: Address[];
};

export function diag(
  code: string,
  severity: Severity,
  message: string,
  addrs: Address[] = [],
): Diagnostic {
  return { code, severity, message, addrs };
}

export type Staged<T> = { value: T; diagnostics: Diagnostic[] };

export const hasErrors = (ds: readonly Diagnostic[]): boolean =>
  ds.some((d) => d.severity === 'error');
