import { describe, it, expect } from "vitest";
import { gemaskeerdeFout, maskeer, maskeerVerbindingssnoeren } from "../../src/server/redact.js";

/**
 * The case these tests exist for (TEN-86): `pg_dump` failed to resolve an
 * internal hostname and Node put the whole command line — connection string
 * included — into the error it threw. That error was logged.
 */
const ECHT_SNOER = "postgresql://postgres:s3cr3t-w4chtw00rd@postgres.railway.internal:5432/railway";

describe("maskeerVerbindingssnoeren", () => {
  it("removes the password but keeps user and host readable", () => {
    const uit = maskeerVerbindingssnoeren(`could not translate host name for ${ECHT_SNOER}`);
    expect(uit).not.toContain("s3cr3t-w4chtw00rd");
    // The diagnosis has to survive the masking, otherwise the log is useless.
    expect(uit).toContain("postgres.railway.internal");
    expect(uit).toContain("postgresql://postgres:***@");
  });

  it("handles both postgres:// and postgresql://", () => {
    const uit = maskeerVerbindingssnoeren("postgres://u:geheim@host/db and postgresql://u:ook@host/db");
    expect(uit).not.toContain("geheim");
    expect(uit).not.toContain("ook");
  });

  it("masks every connection string in one message, not just the first", () => {
    const uit = maskeerVerbindingssnoeren(`from ${ECHT_SNOER} to postgres://ander:tweede@elders/db`);
    expect(uit).not.toContain("s3cr3t-w4chtw00rd");
    expect(uit).not.toContain("tweede");
  });

  it("leaves text without a connection string alone", () => {
    expect(maskeerVerbindingssnoeren("pg_dump: server version mismatch")).toBe(
      "pg_dump: server version mismatch"
    );
  });

  it("does not mistake a password-less URL for one with a password", () => {
    const uit = maskeerVerbindingssnoeren("postgres://postgres@localhost:5432/dev");
    expect(uit).toBe("postgres://postgres@localhost:5432/dev");
  });
});

describe("maskeer", () => {
  it("also masks the literal string the caller knows is secret", () => {
    // A shape the pattern does not recognise: no scheme, so only the literal
    // match can catch it. This is why maskeer takes the URL as well.
    const raar = "user:pw@host/db";
    expect(maskeer(`connecting with ${raar}`, raar)).toBe("connecting with ***");
  });

  it("masks every occurrence of that literal, not just the first", () => {
    const uit = maskeer(`${ECHT_SNOER} failed; retrying ${ECHT_SNOER}`, ECHT_SNOER);
    expect(uit).not.toContain("s3cr3t-w4chtw00rd");
    expect(uit.match(/\*\*\*/g)).toHaveLength(2);
  });
});

describe("gemaskeerdeFout", () => {
  it("returns an error whose message no longer carries the password", () => {
    const origineel = new Error(`Command failed: pg_dump ${ECHT_SNOER} --no-owner`);
    const uit = gemaskeerdeFout(origineel, ECHT_SNOER);
    expect(uit.message).not.toContain("s3cr3t-w4chtw00rd");
    expect(uit.message).toContain("Command failed: pg_dump");
  });

  it("drops the properties execFile hangs on the error", () => {
    // execFile puts stdout, stderr and cmd on the thrown object, and each of
    // those carries the command line too. Patching only `message` would leave
    // three readable copies for whoever logs the whole object.
    const origineel = Object.assign(new Error("Command failed"), {
      cmd: `pg_dump ${ECHT_SNOER}`,
      stderr: `pg_dump: error: connection to ${ECHT_SNOER} failed`,
      stdout: "",
    });
    const uit = gemaskeerdeFout(origineel, ECHT_SNOER) as Error & { cmd?: string; stderr?: string };
    expect(uit.cmd).toBeUndefined();
    expect(uit.stderr).toBeUndefined();
    expect(JSON.stringify(uit, Object.getOwnPropertyNames(uit))).not.toContain("s3cr3t-w4chtw00rd");
  });

  it("masks the stack trace as well", () => {
    const origineel = new Error(`boom ${ECHT_SNOER}`);
    const uit = gemaskeerdeFout(origineel, ECHT_SNOER);
    expect(uit.stack ?? "").not.toContain("s3cr3t-w4chtw00rd");
  });

  it("survives something that is not an Error", () => {
    expect(gemaskeerdeFout(`plain string with ${ECHT_SNOER}`).message).not.toContain("s3cr3t-w4chtw00rd");
  });
});
