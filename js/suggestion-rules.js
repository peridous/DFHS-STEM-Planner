import { courseDetails, validCourseDetails } from "./course-data.js";
import { calculateProgress } from "./progress.js";
import { graduationCredits, requiredCourses } from "./requirements-config.js";

// Planning sequences; check actual course prerequisites.
const coursePaths = [
  ["english-1", "english-2", "english-3", "english-4"],
  ["algebra-1", "algebra-2", "ap-pre-calculus", "ap-calculus-bc", "vector-calculus"],
  ["spanish-1", "spanish-2"],
  ["stem-programming-1-hn", "ap-cs-a"]
];

export function getSuggestions(classes, catalog, limit = 4) {
  const courses = catalog.filter(course => validCourseDetails(course) && course.active !== false).map(courseDetails);
  const byId = new Map(courses.map(course => [course.id, course]));
  const listed = [...classes.values()].map(course => ({ ...course, ...courseDetails(byId.get(course.id) ?? course) }));
  const listedGroups = new Set(listed.map(course => course.creditGroup));
  const completedGroups = new Set(listed.filter(course => course.status === "completed" && course.credits > 0)
    .flatMap(course => [course.creditGroup, ...course.fulfills]));
  const covered = new Set(listed.filter(course => course.credits > 0).flatMap(course => course.fulfills));
  const readyGroups = new Set([...listedGroups, ...covered]);
  const projected = calculateProgress(new Map(listed.map(course => [course.id, { ...course, status: "completed" }])), courses);
  const available = courses.filter(course => course.credits > 0 && !classes.has(course.id) && !listedGroups.has(course.creditGroup))
    .sort((a, b) => ({ Other: 0, Honors: 1, AP: 2 }[a.level] - { Other: 0, Honors: 1, AP: 2 }[b.level]) || a.name.localeCompare(b.name));
  const used = new Set();
  const needed = [];
  const next = [];

  function ready(course) {
    const path = coursePaths.find(path => path.includes(course.creditGroup));
    const index = path?.indexOf(course.creditGroup) ?? -1;
    return index <= 0 || readyGroups.has(path[index - 1]);
  }

  function add(list, course, reason) {
    if (!course || list.length >= limit || used.has(course.creditGroup)) return;
    used.add(course.creditGroup);
    list.push({ course, reason });
  }

  for (const requirement of requiredCourses) {
    for (const id of requirement.courses.filter(id => !covered.has(id))) {
      const course = available.find(course => !used.has(course.creditGroup) && course.fulfills.includes(id) && ready(course));
      add(needed, course, `Helps complete ${requirement.label}.`);
    }
  }
  for (const rule of projected.creditChecks.filter(rule => !rule.complete)) {
    const suggestedCredits = needed.filter(item => item.course.category === rule.id).reduce((sum, item) => sum + item.course.credits, 0);
    const remaining = Math.max(0, rule.target - rule.value - suggestedCredits);
    if (!remaining) continue;
    const course = available.find(course => course.category === rule.id && !used.has(course.creditGroup) && ready(course));
    add(needed, course, `You need ${remaining} more ${rule.label.toLowerCase()} ${remaining === 1 ? "credit" : "credits"} beyond the classes in your list.`);
  }
  let remaining = graduationCredits - projected.totalCredits - needed.reduce((sum, item) => sum + item.course.credits, 0);
  // Suggest extra credits once subject and core requirements are covered.
  if (projected.creditChecks.every(rule => rule.complete) && projected.coreChecks.every(rule => rule.complete)) {
    for (const course of available.filter(course => ready(course))) {
      if (remaining <= 0 || needed.length >= limit) break;
      if (used.has(course.creditGroup)) continue;
      add(needed, course, `Adds ${course.credits} ${course.credits === 1 ? "credit" : "credits"} toward your ${graduationCredits}-credit total.`);
      remaining -= course.credits;
    }
  }

  for (const path of coursePaths) {
    for (let index = 1; index < path.length; index++) {
      if (!completedGroups.has(path[index - 1])) continue;
      const course = available.find(course => course.creditGroup === path[index] && !used.has(course.creditGroup));
      const previous = listed.find(course => course.status === "completed" &&
        (course.creditGroup === path[index - 1] || course.fulfills.includes(path[index - 1])));
      add(next, course, `A next-course option after ${previous?.name || "your completed class"}.`);
    }
  }
  return { needed, next, allGraduationCovered: projected.graduationComplete };
}
