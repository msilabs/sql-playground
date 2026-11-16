import { describe, expect, it } from "vitest";
import { DATASETS } from "@/lib/db/datasets";
import { runStages } from "@/lib/sql/stages";
import { engineWith } from "./engine";

describe("datasets", () => {
  it.each(DATASETS.map((d) => [d.id, d] as const))("%s: শুরুর query চলে আর ধাপ দেখায়", async (_id, dataset) => {
    const engine = await engineWith(dataset.sql);
    const result = await engine.run(dataset.starter);
    expect(result.error).toBeUndefined();
    expect(result.statements[0].total).toBeGreaterThan(0);
    const stages = await runStages(engine, dataset.starter);
    expect(stages.ok).toBe(true);
    if (stages.ok) expect(stages.stages.every((s) => !s.error)).toBe(true);
    const fk = await engine.run("PRAGMA foreign_key_check");
    expect(fk.statements[0].total).toBe(0);
  });
});
