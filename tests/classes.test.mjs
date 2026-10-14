import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import * as data from "../js/course-data.js";

const html = await readFile(new URL("../classes.html", import.meta.url), "utf8");
const script = (await readFile(new URL("../js/classes.js", import.meta.url), "utf8"))
  .trimStart()
  .replace(/^import\s[\s\S]*?;\s*/gm, "");
const biology = { ...data.defaultCourses.find(course => course.id === "ap-biology"), status: "planned" };

function page(saved = [], connectFirebase = async () => { throw new Error("Offline"); }) {
  const dom = new JSDOM(html, { url: "http://localhost:8000/classes.html", runScripts: "outside-only" });
  Object.assign(dom.window, data, { connectFirebase });
  dom.window.localStorage.setItem(data.storageKey, JSON.stringify(saved));
  dom.window.eval(script);
  return {
    dom,
    get: selector => dom.window.document.querySelector(selector),
    click: label => dom.window.document.querySelector(`[aria-label="${label}"]`).click(),
    change(selector, value) {
      const control = dom.window.document.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    }
  };
}

test("page adds once, moves statuses, removes classes, and saves browser selections", t => {
  const p = page();
  t.after(() => p.dom.window.close());
  p.click("Add AP Biology");
  assert.equal(p.get("#planned-count").textContent, "1");
  assert.equal(p.get('[aria-label="AP Biology: Planned"]').disabled, true);
  p.change('[aria-label="Status for AP Biology"]', "enrolled");
  assert.equal(p.get("#planned-count").textContent, "0");
  assert.equal(p.get("#enrolled-count").textContent, "1");
  assert.equal(p.dom.window.document.activeElement.id, "status-ap-biology");
  p.change('[aria-label="Status for AP Biology"]', "completed");
  assert.equal(p.get("#completed-count").textContent, "1");
  assert.equal(data.readClasses(p.dom.window.localStorage).get(biology.id).status, "completed");
  p.click("Remove AP Biology");
  assert.equal(p.get("#completed-count").textContent, "0");
  assert.equal(p.get('[aria-label="Add AP Biology"]').disabled, false);
  assert.equal(data.readClasses(p.dom.window.localStorage).size, 0);
});

test("filter controls combine and clear without changing saved classes", t => {
  const p = page();
  t.after(() => p.dom.window.close());
  p.change("#subject-filter", "Science");
  p.change("#level-filter", "AP");
  p.get("#course-search").value = "biology";
  p.get("#course-search").dispatchEvent(new p.dom.window.Event("input"));
  assert.equal(p.get("#course-results").textContent, "1 course found");
  p.click("Add AP Biology");
  p.get("#available-only").click();
  assert.match(p.get("#course-results").textContent, /No courses match/);
  p.get("#clear-filters").click();
  assert.equal(p.get("#course-results").textContent, `${data.defaultCourses.length} courses found`);
  assert.equal(p.get("#planned-count").textContent, "1");
});

test("a chosen course's school year is saved for recognition tracking", t => {
  const p = page([biology]);
  t.after(() => p.dom.window.close());
  p.change('[aria-label="School year for AP Biology"]', "10");
  assert.equal(data.readClasses(p.dom.window.localStorage).get(biology.id).year, "10");
  assert.equal(p.dom.window.document.activeElement.id, "year-ap-biology");
});

test("saved choices load immediately and new classes use the selected status", t => {
  const p = page([biology]);
  t.after(() => p.dom.window.close());
  assert.equal(p.get("#sign-in"), null);
  assert.equal(p.get("#planned-count").textContent, "1");
  p.change("#add-status", "enrolled");
  p.click("Add Algebra 2");
  assert.equal(p.get("#enrolled-count").textContent, "1");
  assert.equal(data.readClasses(p.dom.window.localStorage).get("algebra-2").status, "enrolled");
});

test("classes can still be chosen when browser storage is blocked", t => {
  const dom = new JSDOM(html, { url: "http://localhost:8000/classes.html", runScripts: "outside-only" });
  t.after(() => dom.window.close());
  Object.assign(dom.window, data, { connectFirebase: async () => { throw new Error("Offline"); } });
  Object.defineProperty(dom.window, "localStorage", { get() { throw new Error("Storage blocked"); } });
  dom.window.eval(script);
  dom.window.document.querySelector('[aria-label="Add AP Biology"]').click();
  assert.equal(dom.window.document.querySelector("#planned-count").textContent, "1");
  assert.match(dom.window.document.querySelector("#class-message").textContent, /kept for this visit/);
  dom.window.document.querySelector('[aria-label="Remove AP Biology"]').click();
  assert.equal(dom.window.document.querySelector("#planned-count").textContent, "0");
});

test("class changes in another tab refresh the list", t => {
  const p = page();
  t.after(() => p.dom.window.close());
  data.writeClasses(p.dom.window.localStorage, new Map([[biology.id, biology]]));
  p.dom.window.dispatchEvent(new p.dom.window.StorageEvent("storage", { key: data.storageKey }));
  assert.equal(p.get("#planned-count").textContent, "1");
  data.writeClasses(p.dom.window.localStorage, new Map());
  p.dom.window.dispatchEvent(new p.dom.window.StorageEvent("storage", { key: data.storageKey }));
  assert.equal(p.get("#planned-count").textContent, "0");
});

const tick = () => new Promise(resolve => setImmediate(resolve));

function catalogFirebase() {
  let onData;
  let onError;
  return {
    async connect() {
      return {
        watchCourses(callback, error) {
          onData = callback;
          onError = error;
          return () => { onData = onError = null; };
        }
      };
    },
    send(records, fromCache = false) {
      onData({
        docs: records.map(course => ({ id: course.id, data: () => course })),
        empty: records.length === 0,
        metadata: { fromCache }
      });
    },
    fail() { onError({ code: "permission-denied" }); }
  };
}

test("Firebase catalog changes update courses and subjects while selections stay local", async t => {
  const api = catalogFirebase();
  const p = page([biology], api.connect);
  t.after(() => p.dom.window.close());
  await tick();
  p.change("#subject-filter", "Science");
  const robotics = { id: "robotics", name: "Robotics", subject: "Engineering", level: "Honors" };
  api.send([robotics]);
  assert.equal(p.get("#subject-filter").value, "");
  assert.equal(p.get("#course-results").textContent, "1 course found");
  assert.match(p.get("#subject-filter").textContent, /Engineering/);
  p.click("Add Robotics");
  assert.equal(data.readClasses(p.dom.window.localStorage).get("robotics").status, "planned");
  api.send([{ ...robotics, name: "Robotics 2" }]);
  assert.ok(p.get('[aria-label="Status for Robotics 2"]'));
  assert.equal(p.get("#planned-count").textContent, "2");
  api.send([]);
  assert.equal(p.get("#course-catalog").children.length, 0);
  assert.equal(p.get("#planned-count").textContent, "2");
  assert.equal(p.get("#catalog-status").textContent, "No courses are available yet.");
});

test("inactive and malformed catalog entries don't become selectable", async t => {
  const api = catalogFirebase();
  const p = page([], api.connect);
  t.after(() => p.dom.window.close());
  await tick();
  api.send([
    { ...biology, status: undefined, active: false },
    { id: "bad-data", name: "Missing subject and level" },
    { ...biology, id: "visible-biology", status: "invalid-extra-field", description: "extra metadata" }
  ]);
  assert.equal(p.get("#course-results").textContent, "1 course found");
  p.click("Add AP Biology");
  const saved = data.readClasses(p.dom.window.localStorage).get("visible-biology");
  assert.equal(saved.status, "planned");
  assert.equal(saved.description, undefined);
});

test("an empty cache keeps starter courses until the server confirms the catalog", async t => {
  const api = catalogFirebase();
  const p = page([], api.connect);
  t.after(() => p.dom.window.close());
  await tick();
  api.send([], true);
  assert.ok(p.get('[aria-label="Add AP Biology"]'));
  api.send([], false);
  assert.equal(p.get("#course-catalog").children.length, 0);
});

test("catalog connection failure offers retry and keeps browser choices", async t => {
  const api = catalogFirebase();
  const p = page([biology], api.connect);
  t.after(() => p.dom.window.close());
  await tick();
  api.fail();
  assert.equal(p.get("#retry-catalog").hidden, false);
  assert.match(p.get("#catalog-status").textContent, /Showing starter courses/);
  p.get("#retry-catalog").click();
  await tick();
  api.send([biology]);
  assert.equal(p.get("#retry-catalog").hidden, true);
  assert.equal(p.get("#course-results").textContent, "1 course found");
  assert.equal(p.get("#planned-count").textContent, "1");
  api.fail();
  assert.match(p.get("#catalog-status").textContent, /last loaded catalog/);
  assert.equal(p.get("#course-results").textContent, "1 course found");
});
