/**
 * Joins class names, dropping anything falsy.
 *
 * Mirrors @knurled/kit's cx. CSS Module lookups are typed `string | undefined`,
 * so plain template interpolation can emit the literal "undefined" into a class
 * attribute. Not a utility-class system: it joins module class names, it does
 * not carry style decisions. Those live in patterns.css.
 */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((part) => typeof part === 'string' && part.length > 0).join(' ');
}
