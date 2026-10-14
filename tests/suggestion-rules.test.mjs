import test from "node:test";
import assert from "node:assert/strict";
import { defaultCourses } from "../js/course-data.js";
import { getSuggestions } from "../js/suggestion-rules.js";

const chosen = (id, status = "completed") => ({ ...defaultCourses.find(course => course.id === id), status });
const classes = items => new Map(items.map(course => [course.id, course]));

test("initial suggestions prioritize missing core classes and stay short", () => {
  const result = getSuggestions(new Map(), defaultCourses);
  assert.equal(result.needed.length, 4);
  assert.deepEqual(result.needed.map(item => item.course.id), ["english-1-hn", "algebra-1-hn", "biology-1", "world-history"]);
  assert.equal(result.next.length, 0);
  assert.equal(getSuggestions(new Map(), defaultCourses, 2).needed.length, 2);
});

test("selected classes and alternate versions are excluded from both lists", () => {
  const listed = classes([chosen("english-1-hn", "planned"), chosen("biology-1-hn", "enrolled"), chosen("algebra-1-hn")]);
  const result = getSuggestions(listed, defaultCourses);
  const offered = [...result.needed, ...result.next].map(item => item.course.id);
  assert.equal(offered.includes("english-1-hn"), false);
  assert.equal(offered.includes("biology-1-hn"), false);
  assert.equal(offered.includes("biology-1"), false);
  assert.equal(offered.includes("algebra-1-hn"), false);
  assert.equal(new Set([...result.needed, ...result.next].map(item => item.course.creditGroup)).size, offered.length);
});

test("completed courses produce next-course ideas without duplicating the needed list", () => {
  const result = getSuggestions(classes([chosen("ap-pre-calculus")]), defaultCourses);
  const next = result.next.find(item => item.course.id === "ap-calculus-bc");
  assert.ok(next);
  assert.match(next.reason, /AP Pre-Calculus/);
  assert.equal(result.needed.some(item => item.course.id === next.course.id), false);
});

test("planned and enrolled credits prevent suggestions for gaps already covered", () => {
  const listed = classes(defaultCourses.filter(course => course.category === "language").map(course => ({ ...course, status: "planned" })));
  const languages = defaultCourses.filter(course => course.category === "language");
  const result = getSuggestions(listed, [...languages,
    { id: "french-1", name: "French I", subject: "Foreign Language", level: "Other", credits: 1, category: "language" }
  ]);
  assert.equal(result.needed.length, 0);
});

test("unknown, zero-credit, and inactive courses aren't recommended", () => {
  const catalog = [
    { id: "unknown", name: "New science course", subject: "Science", level: "Other" },
    { ...chosen("biology-1"), credits: 0 },
    { ...chosen("world-history"), active: false }
  ];
  assert.deepEqual(getSuggestions(new Map(), catalog).needed, []);
});

test("course metadata determines suggestions and an empty catalog stays empty", () => {
  const history = { id: "history-option", name: "History elective", subject: "Social Studies", level: "Other", credits: 1,
    category: "other", fulfills: ["world-history"] };
  assert.equal(getSuggestions(new Map(), [history]).needed[0].course.id, history.id);
  assert.deepEqual(getSuggestions(new Map(), []).needed, []);
  assert.equal(getSuggestions(classes(defaultCourses.map(course => ({ ...course, status: "planned" }))), defaultCourses).allGraduationCovered, true);
});
