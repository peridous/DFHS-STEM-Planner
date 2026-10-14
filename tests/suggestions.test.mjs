import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import * as data from "../js/course-data.js";
import { getSuggestions } from "../js/suggestion-rules.js";

const html = await readFile(new URL("../suggestions.html", import.meta.url), "utf8");
const script = (await readFile(new URL("../js/suggestions.js", import.meta.url), "utf8"))
  .trimStart().replace(/^import\s[\s\S]*?;\s*/gm, "");
const tick = () => new Promise(resolve => setImmediate(resolve));

async function page(saved = [], connectFirebase = async () => { throw new Error("Offline"); }) {
  const dom = new JSDOM(html, { url: "http://localhost:8000/suggestions.html", runScripts: "outside-only" });
  Object.assign(dom.window, data, { getSuggestions, connectFirebase });
  data.writeClasses(dom.window.localStorage, new Map(saved.map(course => [course.id, course])));
  dom.window.eval(script);
  await tick();
  return { dom, get: selector => dom.window.document.querySelector(selector) };
}

test("adding a suggestion saves a planned class and removes that suggestion", async t => {
  const p = await page();
  t.after(() => p.dom.window.close());
  p.get('[aria-label="Plan English I Honors"]').click();
  const saved = data.readClasses(p.dom.window.localStorage);
  assert.equal(saved.get("english-1-hn").status, "planned");
  assert.equal(saved.get("english-1-hn").credits, 1);
  assert.equal(p.get('[aria-label="Plan English I Honors"]'), null);
  assert.match(p.get("#suggestion-message").textContent, /added to planned/);
  assert.equal(p.dom.window.document.activeElement.id, "planned-classes-link");
});

test("adding from a stale suggestion doesn't overwrite a class changed in another tab", async t => {
  const p = await page();
  t.after(() => p.dom.window.close());
  const course = { ...data.defaultCourses.find(course => course.id === "english-1-hn"), status: "completed", year: "9" };
  data.writeClasses(p.dom.window.localStorage, new Map([[course.id, course]]));
  p.get('[aria-label="Plan English I Honors"]').click();
  assert.equal(data.readClasses(p.dom.window.localStorage).get(course.id).status, "completed");
  assert.match(p.get("#suggestion-message").textContent, /already in your class list/);
});

test("changes in another tab refresh suggestions", async t => {
  const p = await page();
  t.after(() => p.dom.window.close());
  const course = { ...data.defaultCourses.find(course => course.id === "english-1-hn"), status: "planned" };
  data.writeClasses(p.dom.window.localStorage, new Map([[course.id, course]]));
  p.dom.window.dispatchEvent(new p.dom.window.StorageEvent("storage", { key: data.storageKey }));
  assert.equal(p.get('[aria-label="Plan English I Honors"]'), null);
});

test("failed browser saves don't claim that a suggestion was added", async t => {
  const p = await page();
  t.after(() => p.dom.window.close());
  const original = p.dom.window.Storage.prototype.setItem;
  p.dom.window.Storage.prototype.setItem = function(key, value) {
    if (key === data.storageKey) throw new Error("Storage full");
    return original.call(this, key, value);
  };
  p.get('[aria-label="Plan English I Honors"]').click();
  assert.equal(data.readClasses(p.dom.window.localStorage).size, 0);
  assert.match(p.get("#suggestion-message").textContent, /Couldn't save/);
  assert.ok(p.get('[aria-label="Plan English I Honors"]'));
});

test("live catalog updates and empty states don't restore starter suggestions", async t => {
  let onCourses;
  const p = await page([], async () => ({
    watchCourses(callback) { onCourses = callback; return () => {}; }
  }));
  t.after(() => p.dom.window.close());
  const course = { id: "new-history", name: "World History Option", subject: "Social Studies", level: "Other", credits: 1,
    category: "other", fulfills: ["world-history"] };
  onCourses({ docs: [{ id: course.id, data: () => course }], metadata: { fromCache: false }, empty: false });
  assert.ok(p.get('[aria-label="Plan World History Option"]'));
  assert.equal(p.get("#needed-suggestion-count").textContent, "1");
  onCourses({ docs: [], metadata: { fromCache: false }, empty: true });
  assert.equal(p.get("#needed-suggestion-count").textContent, "0");
  assert.equal(p.get("#next-suggestion-count").textContent, "0");
  assert.equal(p.get('[aria-label="Plan English I Honors"]'), null);
});
