import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertDumpIsComplete } from "../../src/server/backup.js";

const files: string[] = [];

function tempDumpFile(contents: string): string {
  const filePath = path.join(tmpdir(), `assert-dump-is-complete-test-${Date.now()}-${Math.random()}.sql`);
  writeFileSync(filePath, contents);
  files.push(filePath);
  return filePath;
}

afterEach(() => {
  while (files.length > 0) {
    const filePath = files.pop()!;
    try {
      unlinkSync(filePath);
    } catch {
      // Already removed by the assertion under test, or never written — either way, nothing to clean up.
    }
  }
});

describe("assertDumpIsComplete", () => {
  it("accepts a dump that ends with the pg_dump trailer line", () => {
    const filePath = tempDumpFile("-- some SQL\nCREATE TABLE foo (id int);\n--\n-- PostgreSQL database dump complete\n--\n");
    expect(() => assertDumpIsComplete(filePath)).not.toThrow();
  });

  it("rejects an empty file", () => {
    const filePath = tempDumpFile("");
    expect(() => assertDumpIsComplete(filePath)).toThrow(/empty file/);
  });

  it("rejects a truncated dump missing its trailer line", () => {
    const filePath = tempDumpFile("-- some SQL\nCREATE TABLE foo (id int);\nINSERT INTO foo VALUES (1);\n");
    expect(() => assertDumpIsComplete(filePath)).toThrow(/missing its trailer line/);
  });

  it("finds the trailer line even in a large dump, by only reading the tail", () => {
    const filler = "-- filler line to pad the file out\n".repeat(10_000);
    const filePath = tempDumpFile(`${filler}--\n-- PostgreSQL database dump complete\n--\n`);
    expect(() => assertDumpIsComplete(filePath)).not.toThrow();
  });

  it("rejects a large dump that got cut off before the trailer line", () => {
    const filler = "-- filler line to pad the file out\n".repeat(10_000);
    const filePath = tempDumpFile(filler);
    expect(() => assertDumpIsComplete(filePath)).toThrow(/missing its trailer line/);
  });
});
