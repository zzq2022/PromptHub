import { describe, expect, it } from "vitest";

import {
  getSkillFileIconKind,
  getSkillFileIconUrl,
} from "../../../src/renderer/components/skill/skill-file-icons";

describe("skill-file-icons", () => {
  it("maps common skill file paths to specific icon kinds", () => {
    expect(getSkillFileIconKind("generate_review.py", false)).toBe("python");
    expect(getSkillFileIconKind("viewer.html", false)).toBe("html");
    expect(getSkillFileIconKind("openai.yaml", false)).toBe("yaml");
    expect(getSkillFileIconKind("SKILL.md", false)).toBe("markdown");
    expect(getSkillFileIconKind("package.json", false)).toBe("json");
    expect(getSkillFileIconKind("Dockerfile", false)).toBe("docker");
    expect(getSkillFileIconKind("github-small.svg", false)).toBe("svg");
    expect(getSkillFileIconKind("LICENSE.txt", false)).toBe("license");
    expect(getSkillFileIconKind("scripts", true)).toBe("folder");
    expect(getSkillFileIconKind("scripts", true, true)).toBe("folder-open");
    expect(getSkillFileIconKind("unknown.asset", false)).toBe("file");
  });

  it("returns material icon theme SVG urls instead of generated text badges", () => {
    expect(getSkillFileIconUrl("generate_review.py", false)).toContain(
      "python.svg",
    );
    expect(getSkillFileIconUrl("viewer.html", false)).toContain("html.svg");
    expect(getSkillFileIconUrl("openai.yaml", false)).toContain("yaml.svg");
    expect(getSkillFileIconUrl("scripts", true, true)).toContain(
      "folder-open.svg",
    );
  });
});
