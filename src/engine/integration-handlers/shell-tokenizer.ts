/**
 * Ditto — Shell Command Tokenizer (Brief 170)
 *
 * Pure functions for parsing integration YAML `command_template` strings into
 * argv-friendly tokens, so CLI execution can use `execFile(executable, args)`
 * instead of `exec(shellString)`. Eliminates shell-injection risk from
 * LLM-supplied parameters.
 *
 * Template grammar:
 * - Whitespace outside quotes splits argv entries
 * - Single (`'`) and double (`"`) quotes group their contents literally
 *   (no escape sequences interpreted; `\` is a regular character)
 * - `{name}` placeholders become placeholder tokens; their substituted value
 *   is always a single argv entry, never re-split by whitespace
 * - A single argv entry may mix literal and placeholder parts
 *   (e.g. `"prefix-{id}"` → ["prefix-", placeholder("id")])
 *
 * Unterminated quotes throw at tokenize time.
 *
 * Provenance: Brief 170. Canonical pattern for safe shell-free command
 * execution — mirrors `execFile` contract from Node.js docs and the in-house
 * pattern used in `src/engine/tools.ts` for agent tools.
 */

export type TemplatePart =
  | { type: "literal"; value: string }
  | { type: "placeholder"; name: string };

/**
 * One argv entry — a sequence of literal/placeholder parts that will resolve
 * to a single string when substituted.
 */
export type ArgvTemplate = TemplatePart[];

/** Parse a command template into argv templates. */
export function tokenizeCommandTemplate(template: string): ArgvTemplate[] {
  const entries: ArgvTemplate[] = [];
  let current: ArgvTemplate = [];
  let literal = "";
  let i = 0;
  const n = template.length;

  const pushLiteral = () => {
    if (literal.length > 0) {
      current.push({ type: "literal", value: literal });
      literal = "";
    }
  };
  const finishEntry = () => {
    pushLiteral();
    if (current.length > 0) {
      entries.push(current);
      current = [];
    }
  };

  const scanInto = (s: string) => {
    let j = 0;
    while (j < s.length) {
      if (s[j] === "{") {
        const end = s.indexOf("}", j + 1);
        if (end > -1) {
          const name = s.slice(j + 1, end);
          if (/^[A-Za-z_][\w]*$/.test(name)) {
            pushLiteral();
            current.push({ type: "placeholder", name });
            j = end + 1;
            continue;
          }
        }
      }
      literal += s[j];
      j++;
    }
  };

  while (i < n) {
    const ch = template[i]!;
    if (ch === " " || ch === "\t" || ch === "\n") {
      finishEntry();
      i++;
      continue;
    }
    if (ch === "'") {
      const end = template.indexOf("'", i + 1);
      if (end === -1) {
        throw new Error(
          `Unterminated single quote in command template: ${template}`,
        );
      }
      scanInto(template.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      const end = template.indexOf('"', i + 1);
      if (end === -1) {
        throw new Error(
          `Unterminated double quote in command template: ${template}`,
        );
      }
      scanInto(template.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (ch === "{") {
      const end = template.indexOf("}", i + 1);
      if (end > -1) {
        const name = template.slice(i + 1, end);
        if (/^[A-Za-z_][\w]*$/.test(name)) {
          pushLiteral();
          current.push({ type: "placeholder", name });
          i = end + 1;
          continue;
        }
      }
    }
    literal += ch;
    i++;
  }
  finishEntry();
  return entries;
}

/**
 * Resolve argv templates against a parameter map, producing a concrete argv.
 *
 * - Placeholders with undefined/null values cause the *entire argv entry*
 *   to be omitted (matches shell `$VAR` semantics with unset vars in quoted
 *   contexts — the quoted arg disappears rather than becoming an empty arg).
 * - Empty-string values are preserved (the caller explicitly said "this arg
 *   is empty"); dropping an empty arg would silently mutate intent.
 * - Non-string values are converted with `String(value)`.
 */
export function substituteArgv(
  entries: ArgvTemplate[],
  params: Record<string, unknown>,
): string[] {
  const argv: string[] = [];
  for (const entry of entries) {
    let resolved = "";
    let drop = false;
    for (const part of entry) {
      if (part.type === "literal") {
        resolved += part.value;
      } else {
        const v = params[part.name];
        if (v === undefined || v === null) {
          drop = true;
          break;
        }
        resolved += String(v);
      }
    }
    if (!drop) argv.push(resolved);
  }
  return argv;
}

/** Produce a human-readable representation of an argv for log lines. */
export function formatArgvForLog(executable: string, args: string[]): string {
  const parts = [executable, ...args].map((a) => {
    if (a.length === 0) return "''";
    if (/[\s'"\\$`(){}\[\];&|<>*?#!]/.test(a)) {
      return `'${a.replaceAll("'", "'\\''")}'`;
    }
    return a;
  });
  return parts.join(" ");
}
