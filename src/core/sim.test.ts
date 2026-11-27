import { controlBusbars } from "./testing";
import { describe, expect, test } from "bun:test";
import { newProject, type Project } from "./model";
import { addElement, connect, linkContact } from "./ops";
import { advance, compile, describeAction, initialState, press, search, settle, toggle } from "./sim";

function ladder() {
  const p = newProject("t");
  const pg = p.pages[0]!.id;
  const { cct: cct, ov: ov } = controlBusbars(p, pg, 10, 80);
  const add = (s: string, x: number, y: number, params = {}) => addElement(p, pg, s, [x, y], { params });
  const w = (a: [string, string], b: [string, string]) => connect(p, pg, a, b);
  const top = (x: number): [string, string] => [cct.id, String(x)];
  const bottom = (x: number): [string, string] => [ov.id, String(x)];
  return { p, pg, add, w, top, bottom };
}

describe("relay logic", () => {
  test("start/stop latch with a running lamp", () => {
    const { p, add, w, top, bottom } = ladder();
    const stop = add("pushbutton", 20, 20, { contact: "nc" });
    const start = add("pushbutton", 20, 35);
    const hold = add("contact", 30, 35);
    const k = add("coil", 20, 70);
    w(top(20), [stop.id, "11"]);
    w([stop.id, "12"], [start.id, "13"]);
    w([start.id, "14"], [k.id, "A1"]);
    w([k.id, "A2"], bottom(20));
    w([stop.id, "12"], [hold.id, "13"]);
    w([hold.id, "14"], [k.id, "A1"]);
    linkContact(p, hold.id, k.id);
    const kl = add("contact", 50, 30);
    const lamp = add("lamp", 50, 60);
    w(top(50), [kl.id, "13"]);
    w([kl.id, "14"], [lamp.id, "+V"]);
    w([lamp.id, "-V"], bottom(50));
    linkContact(p, kl.id, k.id);

    const c = compile(p);
    let s = initialState(c);
    expect(s.energised[k.id]).toBeFalsy();
    s = press(c, s, start.id);
    expect(s.energised[k.id]).toBe(true);
    expect(s.lamps[lamp.id]).toBe(true);
    s = press(c, s, stop.id);
    expect(s.energised[k.id]).toBe(false);
    expect(s.lamps[lamp.id]).toBe(false);
  });

  test("on-delay timer closes its contact after the delay", () => {
    const { p, add, w, top, bottom } = ladder();
    const sw = add("selector", 20, 30);
    const t = add("coil", 20, 70, { type: "timer", time: "10s", mode: "on" });
    w(top(20), [sw.id, "13"]);
    w([sw.id, "14"], [t.id, "A1"]);
    w([t.id, "A2"], bottom(20));
    const tc = add("contact", 40, 30);
    const lamp = add("lamp", 40, 60);
    w(top(40), [tc.id, "13"]);
    w([tc.id, "14"], [lamp.id, "+V"]);
    w([lamp.id, "-V"], bottom(40));
    linkContact(p, tc.id, t.id);
    const c = compile(p);
    let s = toggle(c, initialState(c), sw.id);
    expect(s.energised[t.id]).toBe(true);
    s = advance(c, s, 9);
    expect(s.lamps[lamp.id]).toBe(false);
    s = advance(c, s, 1);
    expect(s.lamps[lamp.id]).toBe(true);
    s = toggle(c, s, sw.id);
    expect(s.lamps[lamp.id]).toBe(false);
  });

  test("a switch straight across the supply is a short", () => {
    const { p, add, w, top, bottom } = ladder();
    const sw = add("selector", 20, 40);
    w(top(20), [sw.id, "13"]);
    w([sw.id, "14"], bottom(20));
    const c = compile(p);
    expect(initialState(c).short).toBe(false);
    expect(toggle(c, initialState(c), sw.id).short).toBe(true);
  });

  test("an isolator starts closed and opening it kills the circuit", () => {
    const { p, add, w, top, bottom } = ladder();
    const q = add("isolator", 20, 30, { poles: 1 });
    const lamp = add("lamp", 20, 60);
    w(top(20), [q.id, "1"]);
    w([q.id, "2"], [lamp.id, "+V"]);
    w([lamp.id, "-V"], bottom(20));
    const c = compile(p);
    expect(initialState(c).lamps[lamp.id]).toBe(true);
    expect(toggle(c, initialState(c), q.id).lamps[lamp.id]).toBe(false);
  });
});

/** Two contactors closing onto one load from two supplies: an ATS. */
function ats(interlocked: boolean) {
  const { p, add, w, top, bottom } = ladder();
  const s1 = add("selector", 20, 20);
  const s2 = add("selector", 60, 20);
  const q1 = add("coil", 20, 70, { type: "contactor" });
  const q2 = add("coil", 60, 70, { type: "contactor" });
  w(top(20), [s1.id, "13"]);
  w(top(60), [s2.id, "13"]);
  if (interlocked) {
    const i1 = add("contact", 20, 40, { contact: "nc" });
    const i2 = add("contact", 60, 40, { contact: "nc" });
    w([s1.id, "14"], [i1.id, "21"]);
    w([i1.id, "22"], [q1.id, "A1"]);
    w([s2.id, "14"], [i2.id, "21"]);
    w([i2.id, "22"], [q2.id, "A1"]);
    linkContact(p, i1.id, q2.id);
    linkContact(p, i2.id, q1.id);
  } else {
    w([s1.id, "14"], [q1.id, "A1"]);
    w([s2.id, "14"], [q2.id, "A1"]);
  }
  w([q1.id, "A2"], bottom(20));
  w([q2.id, "A2"], bottom(60));
  return { p, q1, q2 };
}

describe("rule search", () => {
  test("finds the shortest way to parallel the supplies when there's no interlock", () => {
    const { p, q1, q2 } = ats(false);
    const c = compile(p);
    const r = search(c, initialState(c), [{ id: "r1", kind: "never", when: [{ ref: q1.id, on: true }, { ref: q2.id, on: true }], join: "and" }]);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]!.path).toHaveLength(2);
    expect(r.violations[0]!.path.map((a) => describeAction(c, a, false))[0]).toMatch(/^operate S/);
  });

  test("proves the interlocked version safe", () => {
    const { p, q1, q2 } = ats(true);
    const c = compile(p);
    const r = search(c, initialState(c), [{ id: "r1", kind: "never", when: [{ ref: q1.id, on: true }, { ref: q2.id, on: true }], join: "and" }]);
    expect(r.violations).toEqual([]);
    expect(r.truncated).toBe(false);
    expect(r.faults).toEqual([]);
  });
});

export { settle, type Project };
