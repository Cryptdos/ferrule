/**
 * Designation prefixes (docs/designations.md).
 */

export type SymbolKind =
  | "relay"
  | "timer"
  | "contactor"
  | "isolator"
  | "fuse"
  | "breaker"
  | "pushButton"
  | "selector"
  | "lamp"
  | "motor"
  | "transformer"
  | "terminal"
  | "socket"
  | "earth"
  | "busbar"
  | "cable"
  | "pressureSensor"
  | "temperatureSensor";

export interface DesignationStandard {
  id: string;
  name: string;
  prefixes: Record<SymbolKind, string>;
}

/** Letters a prefix must never start with (IEC 81346-2:2019). */
export const FORBIDDEN_LETTERS = ["A", "I", "O"];
/** Letters reserved for future standardisation (IEC 81346-2:2019). */
export const RESERVED_LETTERS = ["D", "J", "L", "V", "Y", "Z"];

export const IEC_81346_2_2019: DesignationStandard = {
  id: "iec-81346-2-2019",
  name: "IEC 81346-2:2019",
  prefixes: {
    relay: "K",
    timer: "K",
    contactor: "Q",
    isolator: "Q",
    fuse: "F",
    breaker: "F",
    pushButton: "S",
    selector: "S",
    lamp: "P",
    motor: "M",
    transformer: "T",
    terminal: "X",
    socket: "X",
    earth: "X",
    busbar: "W",
    cable: "W",
    pressureSensor: "BP",
    temperatureSensor: "BT",
  },
};

export const STANDARDS: DesignationStandard[] = [IEC_81346_2_2019];

/**
 * Checks a custom override prefix. Returns an error message, or null if
 * the prefix is acceptable.
 */
export function validateOverride(prefix: string): string | null {
  if (!/^[A-Z]{1,3}$/.test(prefix)) return "Prefix must be 1–3 capital letters";
  if (FORBIDDEN_LETTERS.includes(prefix[0]!)) {
    return `Prefix must not start with ${prefix[0]}`;
  }
  return null;
}
