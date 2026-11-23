/**
 * For tests: a control circuit's CCT and 0V busbars, each on its own
 * distribution, as most simulation tests need. With no Incoming supply drawn
 * they're the supply and return.
 */
import type { Element, Project } from "./model";
import { addDistribution, addElement } from "./ops";

export function controlBusbars(project: Project, pageId: string, top = 10, bottom = 80, length = 140): { cct: Element; ov: Element } {
  const d = (name: string, kind: "dc+" | "dc0") =>
    project.distributions.find((x) => x.name === name) ?? addDistribution(project, { name, kind, voltage: kind === "dc+" ? "24 V DC" : "0 V" });
  const cct = addElement(project, pageId, "busbar", [0, top], { params: { style: "control", dist: d("CCT", "dc+").id, length } });
  const ov = addElement(project, pageId, "busbar", [0, bottom], { params: { style: "control", dist: d("0V", "dc0").id, length } });
  return { cct, ov };
}
