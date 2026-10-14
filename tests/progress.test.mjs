import test from "node:test";
import assert from "node:assert/strict";
import { defaultCourses, courseDetails, readClasses, storageKey } from "../js/course-data.js";
import { calculateProgress } from "../js/progress.js";

function selection(id, status = "completed", year = "") {
  return { ...defaultCourses.find(course => course.id === id), status, year };
}

const classes = courses => new Map(courses.map(course => [course.id, course]));

test("only completed courses earn credits; changing status removes the credit", () => {
  const chosen = classes([selection("ap-biology"), selection("algebra-2", "enrolled"), selection("spanish-1", "planned")]);
  assert.equal(calculateProgress(chosen).totalCredits, 1);
  assert.equal(calculateProgress(chosen).coreChecks.find(rule => rule.id === "biology").complete, true);
  chosen.set("ap-biology", selection("ap-biology", "enrolled"));
  assert.equal(calculateProgress(chosen).totalCredits, 0);
  assert.equal(calculateProgress(chosen).coreChecks.find(rule => rule.id === "biology").complete, false);
});

test("English I and II both need completion before their core check is met", () => {
  const chosen = classes([selection("english-1-hn"), selection("english-2-hn", "planned")]);
  assert.equal(calculateProgress(chosen).coreChecks.find(rule => rule.id === "english").complete, false);
  chosen.set("english-2-hn", selection("english-2-hn"));
  const progress = calculateProgress(chosen);
  assert.equal(progress.coreChecks.find(rule => rule.id === "english").complete, true);
  assert.equal(progress.creditChecks.find(rule => rule.id === "english").value, 2);
});

test("24 electives don't satisfy graduation, but all listed requirements do", () => {
  const electives = classes(Array.from({ length: 24 }, (_, i) => ({
    ...selection("game-design-hn"), id: `elective-${i}`, creditGroup: `elective-${i}`
  })));
  assert.equal(calculateProgress(electives).totalCredits, 24);
  assert.equal(calculateProgress(electives).graduationComplete, false);
  const allCourses = classes(defaultCourses.map(course => ({ ...course, status: "completed" })));
  const progress = calculateProgress(allCourses);
  assert.ok(progress.totalCredits >= 24);
  assert.equal(progress.graduationComplete, true);
  assert.equal(progress.checksMet, progress.checkCount);
});

test("four math courses in one year count as one year; separate years unlock recognition", () => {
  const ids = ["algebra-2", "ap-pre-calculus", "ap-calculus-bc", "vector-calculus"];
  const chosen = classes(ids.map(id => selection(id, "completed", "9")));
  assert.equal(calculateProgress(chosen).mathYears, 1);
  assert.equal(calculateProgress(chosen).recognition.some(track => track.complete), false);
  ids.forEach((id, index) => chosen.set(id, selection(id, "completed", String(index + 9))));
  assert.equal(calculateProgress(chosen).mathYears, 4);
  assert.equal(calculateProgress(chosen).recognition.every(track => track.complete), true);
  chosen.set(ids[3], selection(ids[3], "enrolled", "12"));
  assert.equal(calculateProgress(chosen).mathYears, 3);
  assert.equal(calculateProgress(chosen).recognition.some(track => track.complete), false);
});

test("school years need a full math credit and exclude middle-school work", () => {
  const chosen = classes([
    selection("algebra-1-hn", "completed", "before-high-school"),
    { ...selection("geometry-hn", "completed", "9"), credits: 0.5 },
    { ...selection("algebra-2", "completed", "9"), credits: 0.5 }
  ]);
  const catalog = [...chosen.values()];
  assert.equal(calculateProgress(chosen, catalog).totalCredits, 2);
  assert.equal(calculateProgress(chosen, catalog).mathYears, 1);
  chosen.delete("algebra-2");
  assert.equal(calculateProgress(chosen, catalog).mathYears, 0);
});

test("standard and honors versions of one course don't earn duplicate credits", () => {
  const chosen = classes([selection("biology-1"), selection("biology-1-hn")]);
  const progress = calculateProgress(chosen);
  assert.equal(progress.totalCredits, 1);
  assert.equal(progress.repeatedCourses, 1);
  assert.equal(progress.coreChecks.find(rule => rule.id === "biology").complete, true);
});

test("legacy selections gain known metadata and unknown credits remain uncounted", () => {
  const raw = [{ id: "ap-biology", name: "AP Biology", subject: "Science", level: "AP", status: "completed" }];
  const chosen = readClasses({ getItem: key => key === storageKey ? JSON.stringify(raw) : null });
  assert.equal(calculateProgress(chosen).totalCredits, 1);
  const unknown = courseDetails({ id: "unknown-course", name: "New elective", subject: "Arts", level: "Other" });
  chosen.set(unknown.id, { ...unknown, status: "completed" });
  assert.equal(calculateProgress(chosen).totalCredits, 1);
  assert.equal(calculateProgress(chosen).missingCredits, 1);
});

test("catalog metadata edits recalculate completed credits without changing the saved list", () => {
  const chosen = classes([selection("ap-biology")]);
  const catalog = [{ ...selection("ap-biology"), credits: 0.5 }];
  assert.equal(calculateProgress(chosen, catalog).totalCredits, 0.5);
  assert.equal(chosen.get("ap-biology").credits, 1);
});
