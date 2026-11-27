/**
 * Project file names (v0.5 A17, A8, §5 D2). What's typed is the file you
 * get, capitals and spaces included. Windows' rules apply everywhere, so a
 * file made on one machine can always be moved to another.
 */

/** Characters no file name may have on Windows. */
const BAD = /[\\/:*?"<>|]/;
/** Names Windows keeps for devices, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Why a name can't be a file's, or null when it can. */
export function fileNameProblem(name: string): string | null {
  if (!name.trim()) return "Give it a file name";
  if (BAD.test(name)) return `A file name can't have any of \\ / : * ? " < > |`;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(name)) return "A file name can't have control characters";
  if (/[. ]$/.test(name)) return "A file name can't end with a space or a full stop";
  if (/^ /.test(name)) return "A file name can't start with a space";
  if (RESERVED.test(name)) return `${name} is a name Windows keeps for itself`;
  if (name.length > 120) return "That file name is too long (120 characters at most)";
  return null;
}

/**
 * How a file name is compared, and the project's id in the app's addresses:
 * lower case, anything but letters and digits a hyphen. Two names with the
 * same key are the same name (A8): `LSP 01` and `lsp-01`.
 */
export function fileKey(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "project";
}
