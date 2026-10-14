import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultCourses, storageKey, readClasses, writeClasses, filterCourses, validCourse, validSelection
} from "../js/course-data.js";

const biology = defaultCourses.find(course => course.id === "ap-biology");

function browserStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test("classes survive reloads, move between statuses, and can be removed", () => {
  const storage = browserStorage();
  const classes = readClasses(storage);
  assert.equal(classes.size, 0);
  classes.set(biology.id, { ...biology, status: "planned" });
  writeClasses(storage, classes);
  const reloaded = readClasses(storage);
  assert.equal(reloaded.get(biology.id).status, "planned");
  reloaded.set(biology.id, { ...biology, status: "enrolled" });
  writeClasses(storage, reloaded);
  assert.equal(readClasses(storage).size, 1);
  assert.equal(readClasses(storage).get(biology.id).status, "enrolled");
  reloaded.delete(biology.id);
  writeClasses(storage, reloaded);
  assert.equal(readClasses(storage).size, 0);
});

test("search combines words, subject, level, and already-selected filtering", () => {
  const classes = new Map([[biology.id, { ...biology, status: "completed" }]]);
  assert.deepEqual(filterCourses(defaultCourses, classes, "  BIOLOGY science ", "Science", "AP", false), [biology]);
  assert.equal(filterCourses(defaultCourses, classes, "biology", "Science", "AP", true).length, 0);
  assert.equal(filterCourses(defaultCourses, classes, "biology", "Math", "", false).length, 0);
  assert.equal(filterCourses(defaultCourses, classes, "no such class", "", "", false).length, 0);
});

test("invalid saved data is rejected rather than presented as a valid plan", () => {
  const storage = browserStorage();
  for (const data of ["broken json", "{}", '[{"id":"missing-fields"}]', JSON.stringify([{ ...biology, status: "approved" }])]) {
    storage.setItem(storageKey, data);
    assert.throws(() => readClasses(storage));
  }
  assert.equal(validCourse({ ...biology, id: "users/other" }), false);
  assert.equal(validSelection({ ...biology, status: "toString" }), false);
  assert.equal(validCourse({ ...biology, name: " " }), false);
});

test("each bundled course has a valid, distinct document ID", () => {
  assert.equal(defaultCourses.every(validCourse), true);
  assert.equal(new Set(defaultCourses.map(course => course.id)).size, defaultCourses.length);
});
