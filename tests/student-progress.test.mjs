import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import * as data from "../js/course-data.js";
import { calculateProgress } from "../js/progress.js";
import { graduationCredits } from "../js/requirements-config.js";

const script = (await readFile(new URL("../js/student-progress.js", import.meta.url), "utf8"))
  .trimStart().replace(/^import\s[\s\S]*?;\s*/gm, "");
const tick = () => new Promise(resolve => setImmediate(resolve));
const chosen = (id, year = "") => ({ ...data.defaultCourses.find(course => course.id === id), status: "completed", year });

async function page(file, selections, connectFirebase = async () => { throw new Error("Offline"); }) {
  const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: `http://localhost:8000/${file}`, runScripts: "outside-only" });
  Object.assign(dom.window, data, { calculateProgress, graduationCredits, connectFirebase });
  data.writeClasses(dom.window.localStorage, new Map(selections.map(course => [course.id, course])));
  dom.window.eval(script);
  await tick();
  return {
    dom,
    get: selector => dom.window.document.querySelector(selector),
    update(selections) {
      data.writeClasses(dom.window.localStorage, new Map(selections.map(course => [course.id, course])));
      dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: data.storageKey }));
    }
  };
}

test("overview and requirements share the same totals and update after class changes", async t => {
  const selections = [chosen("ap-biology"), chosen("english-1-hn"), { ...chosen("algebra-2"), status: "enrolled" }];
  const overview = await page("index.html", selections);
  const requirements = await page("requirements.html", selections);
  t.after(() => { overview.dom.window.close(); requirements.dom.window.close(); });
  assert.equal(overview.get("#total-credits").textContent, "2");
  assert.equal(requirements.get("#graduation-total").textContent, "2 / 24");
  assert.equal(overview.get("#graduation-progress").value, 2);
  assert.ok(requirements.get('[data-requirement="biology"]').classList.contains("completed"));
  assert.ok(requirements.get('[data-requirement="english"]').classList.contains("pending"));
  overview.update([]);
  requirements.update([]);
  assert.equal(overview.get("#total-credits").textContent, "0");
  assert.equal(requirements.get("#graduation-total").textContent, "0 / 24");
});

test("recognition milestones complete for four math years and revert after removal", async t => {
  const ids = ["algebra-2", "ap-pre-calculus", "ap-calculus-bc", "vector-calculus"];
  const selections = ids.map((id, index) => chosen(id, String(index + 9)));
  const p = await page("requirements.html", selections);
  t.after(() => p.dom.window.close());
  assert.equal(p.get("#scholar-total").textContent, "1 / 1");
  assert.equal(p.get("#honors-total").textContent, "1 / 1");
  assert.equal(p.dom.window.document.querySelectorAll(".milestone.completed").length, 3);
  assert.ok(p.get('[data-requirement="math-years"]').classList.contains("completed"));
  p.update(selections.slice(0, 3));
  assert.equal(p.get("#honors-total").textContent, "0 / 1");
  assert.equal(p.dom.window.document.querySelectorAll(".milestone.completed").length, 0);
  assert.match(p.get("#recognition-note").textContent, /3 \/ 4 math years/);
});

test("live catalog credit changes reach the overview without a reload", async t => {
  let onCourses;
  const p = await page("index.html", [chosen("ap-biology")], async () => ({
    watchCourses(callback) { onCourses = callback; return () => {}; }
  }));
  t.after(() => p.dom.window.close());
  onCourses({
    docs: [{ id: "ap-biology", data: () => ({ ...chosen("ap-biology"), credits: 0.5 }) }],
    metadata: { fromCache: false }, empty: false
  });
  assert.equal(p.get("#total-credits").textContent, "0.5");
  assert.equal(p.get("#graduation-progress").value, 0.5);
});
