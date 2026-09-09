/**
 * Keep Postgres connection strings out of logs and error messages.
 *
 * WHAT WENT WRONG (TEN-86, 9 September 2026)
 *
 * A one-off backup ran against production with a `DATABASE_URL` pointing at
 * `postgres.railway.internal` — a hostname that only resolves inside Railway's
 * network. `pg_dump` could not resolve it and failed, and Node's `execFile`
 * puts the whole command line into the error message it throws. The connection
 * string is `argv[1]`, so the password ended up in a log file.
 *
 * The damage was limited — an internal host is useless from outside — but the
 * rule that applies to tokens applies here too: a secret that has once been
 * somewhere it does not belong is leaked, also after you delete it. Log files
 * get copied, forwarded and kept without anyone tracking it.
 *
 * WHY THIS LIVES IN THE SHARED PACKAGE
 *
 * Four products run this code. Fixing it in one of them would leave the same
 * trap set in the other three, and the next person to hit it would have no way
 * of knowing it had been found before.
 *
 * WHY A PATTERN AND NOT JUST THE ONE STRING
 *
 * Replacing only the exact `databaseUrl` we were handed covers the argument we
 * passed, but not a string `pg_dump` echoes back in a slightly different shape
 * — a URL-encoded password, or one of several URLs in the same message. The
 * pattern catches the shape; the caller's own value is masked on top of that.
 */

/** What replaces the password. Deliberately not the same length as the original. */
const MASKER = "***";

/**
 * Masks the password in every Postgres URI in `text`.
 *
 * Matches `scheme://user:password@` and keeps everything except the password:
 * the user and the host stay readable, because those are what make an error
 * message worth reading at all. An error saying "cannot resolve
 * postgres.railway.internal" is a diagnosis; one saying "cannot resolve ***"
 * is a riddle.
 */
export function maskeerVerbindingssnoeren(tekst: string): string {
  return tekst.replace(
    /\b(postgres(?:ql)?:\/\/[^:@/\s]+:)([^@\s]*)(@)/gi,
    (_geheel, kop: string, _wachtwoord: string, staart: string) => `${kop}${MASKER}${staart}`
  );
}

/**
 * Masks connection strings, plus one literal value the caller knows is secret.
 *
 * The second argument is the URL we passed to `pg_dump` ourselves. It is masked
 * whole and not just its password: if it reaches a log in a form the pattern
 * above does not recognise, it should still not be readable.
 */
export function maskeer(tekst: string, snoer?: string): string {
  const gemaskeerd = maskeerVerbindingssnoeren(tekst);
  if (!snoer) return gemaskeerd;
  return gemaskeerd.split(snoer).join(MASKER);
}

/**
 * Rebuilds an error with everything masked.
 *
 * A new `Error` rather than a patched one: `execFile` hangs `stdout`, `stderr`
 * and `cmd` on the object it throws, and each of those carries the command line
 * too. Patching `message` alone leaves three copies behind for whoever logs the
 * whole object.
 */
export function gemaskeerdeFout(fout: unknown, snoer?: string): Error {
  const bericht = fout instanceof Error ? fout.message : String(fout);
  const uit = new Error(maskeer(bericht, snoer));
  if (fout instanceof Error && fout.stack) {
    uit.stack = maskeer(fout.stack, snoer);
  }
  return uit;
}
