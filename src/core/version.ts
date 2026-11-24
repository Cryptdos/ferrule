/** The version in package.json: the one place to change it for a release. */
import pkg from "../../package.json" with { type: "json" };

export const VERSION: string = pkg.version;

/** Where releases are, for a file saved by a newer Ferrule (v0.4.x T19). */
export const RELEASES_URL = "https://github.com/Cryptdos/ferrule/releases";
