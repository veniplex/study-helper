/**
 * Pure helpers for the command-palette search route. Kept DB-free so the
 * escaping rules are unit-tested (see query.test.ts).
 */

/** Escapes the LIKE/ILIKE wildcard metacharacters so user input matches
 *  literally (backslash is the default ESCAPE char in Postgres LIKE). */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&")
}

/** Builds a `%…%` ILIKE pattern with wildcards in the term escaped. */
export function likePattern(input: string): string {
  return `%${escapeLike(input)}%`
}
