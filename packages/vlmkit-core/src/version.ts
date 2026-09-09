/**
 * The one place the shipped version number is written.
 *
 * It was written in three: this number, `cli.version(...)` in `src/cli/cli.ts`, and the MCP
 * server's `{ name: "vlmkit", version }` handshake. `src/cli/version.test.ts` already caught the
 * drift — it compares every copy against the root manifest — but catching it is not the same as not
 * having it: the 0.11.0 bump failed that test twice and needed three files edited to go green, and
 * the number two independent parties use to identify a build (`--version` in a bug report, the
 * handshake in an MCP client's log) should not depend on remembering the third file.
 *
 * This is a literal rather than a `package.json` read on purpose. The CLI is bundled to
 * `dist/*.mjs` and a manifest read resolves relative to the *bundle*, not the source — the reason
 * it was hardcoded to begin with. `src/cli/version.test.ts` still asserts this constant matches
 * every `package.json` and that the CHANGELOG has a section for it, so the literal cannot drift
 * from the release either.
 */
export const VLMKIT_VERSION = "0.19.0";
