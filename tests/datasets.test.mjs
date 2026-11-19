import { describe, it } from 'node:test';
import { expect, engineWith, Datasets, Stages } from './helpers.mjs';

const { DATASETS } = Datasets;
const { runStages } = Stages;
describe("datasets", () => {
    for (const dataset of DATASETS) it(`${dataset.id}: শুরুর query চলে আর ধাপ দেখায়`, async () => {
        const engine = await engineWith(dataset.id);
        const result = await engine.run(dataset.starter);
        expect(result.error).toBeUndefined();
        expect(result.statements[0].total).toBeGreaterThan(0);
        const stages = await runStages(engine, dataset.starter);
        expect(stages.ok).toBe(true);
        if (stages.ok)
            expect(stages.stages.every((s) => !s.error)).toBe(true);
        const fk = await engine.run("PRAGMA foreign_key_check");
        expect(fk.statements[0].total).toBe(0);
    });
});
