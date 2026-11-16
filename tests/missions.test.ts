import { describe, expect, it } from "vitest";
import { DOKAN_SQL } from "@/lib/db/datasets/dokan";
import { query } from "@/lib/db/types";
import { MISSIONS, TOTAL_TASKS, checkTask, compareRows, missionAt, taskAt } from "@/lib/missions";
import { engineWith } from "./engine";

describe("missions", () => {
  it("প্রতিটা কাজের সমাধান নিজের যাচাই পাস করে, আর state কাজ আগে থেকে পূর্ণ থাকে না", async () => {
    const engine = await engineWith(DOKAN_SQL);
    for (let step = 0; step < TOTAL_TASKS; step++) {
      const task = taskAt(step)!;
      if (task.check === "state") {
        expect(await checkTask(engine, task, null, false), task.label).toEqual({ status: "skip" });
        const run = await engine.run(task.solution);
        expect(run.error, task.label).toBeUndefined();
        expect(await checkTask(engine, task, null, true), task.label).toEqual({ status: "pass" });
      } else {
        const result = await query(engine, task.solution);
        expect(result.total, task.label).toBeGreaterThan(0);
        expect(await checkTask(engine, task, result, false), task.label).toEqual({ status: "pass" });
      }
    }
  });

  it("ভুল উত্তর ধরা পড়ে", async () => {
    const engine = await engineWith(DOKAN_SQL);
    const task = MISSIONS[1].tasks[0];
    const wrong = await query(engine, "SELECT name, price FROM products WHERE price > 500");
    const outcome = await checkTask(engine, task, wrong, false);
    expect(outcome.status).toBe("fail");
    const fewer = await query(engine, "SELECT name FROM products WHERE price > 1000");
    expect(await checkTask(engine, task, fewer, false)).toMatchObject({ status: "fail", reason: "columns" });
  });

  it("ordered কাজে ক্রম ধরে, rows কাজে ধরে না", async () => {
    const engine = await engineWith(DOKAN_SQL);
    const asc = await query(engine, "SELECT name, price FROM products ORDER BY price ASC");
    const desc = await query(engine, "SELECT name, price FROM products ORDER BY price DESC");
    expect(compareRows(asc, desc, false)).toEqual({ status: "pass" });
    expect(compareRows(asc, desc, true)).toMatchObject({ status: "fail", reason: "order" });
  });

  it("DB বদলানো কাজে ভুল UPDATE ধরা পড়ে", async () => {
    const engine = await engineWith(DOKAN_SQL);
    await engine.run(MISSIONS[9].tasks[0].solution);
    await engine.run("UPDATE products SET price = 220");
    expect(await checkTask(engine, MISSIONS[9].tasks[1], null, true)).toMatchObject({ status: "fail", reason: "state" });
  });

  it("missionAt", () => {
    expect(missionAt(0)).toEqual({ index: 0, done: 0 });
    expect(missionAt(2)).toEqual({ index: 1, done: 0 });
    expect(missionAt(TOTAL_TASKS)).toEqual({ index: MISSIONS.length, done: 0 });
  });
});
