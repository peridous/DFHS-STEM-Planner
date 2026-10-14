import { defaultCourses, courseDetails } from "./course-data.js";
import { graduationCredits, creditRequirements, requiredCourses, recognitionTracks } from "./requirements-config.js";

export function calculateProgress(classes, catalog = defaultCourses, tracks = recognitionTracks) {
  const catalogById = new Map(catalog.map(course => [course.id, course]));
  const completed = [...classes.values()].filter(course => course.status === "completed")
    .map(course => ({ ...course, ...courseDetails(catalogById.get(course.id) ?? course) }));
  const earned = new Map();
  for (const course of completed) {
    const previous = earned.get(course.creditGroup);
    if (!previous || (course.credits ?? 0) > (previous.credits ?? 0)) earned.set(course.creditGroup, course);
  }

  const courses = [...earned.values()];
  const totals = { totalCredits: 0, mathYears: 0, scienceYears: 0, stemCredits: 0, advancedStemCredits: 0, apStemCredits: 0 };
  const categoryCredits = {};
  const fulfilled = new Set();
  const yearCredits = { math: {}, science: {} };
  for (const course of courses) {
    const credits = course.credits ?? 0;
    totals.totalCredits += credits;
    categoryCredits[course.category] = (categoryCredits[course.category] || 0) + credits;
    if (credits <= 0) continue;
    course.fulfills.forEach(id => fulfilled.add(id));
    if (["math", "science"].includes(course.category) && ["9", "10", "11", "12"].includes(course.year)) {
      yearCredits[course.category][course.year] = (yearCredits[course.category][course.year] || 0) + credits;
    }
    if (["Math", "Science", "Tech"].includes(course.subject)) {
      totals.stemCredits += credits;
      if (["Honors", "AP"].includes(course.level)) totals.advancedStemCredits += credits;
      if (course.level === "AP") totals.apStemCredits += credits;
    }
  }
  totals.mathYears = Object.values(yearCredits.math).filter(credits => credits >= 1).length;
  totals.scienceYears = Object.values(yearCredits.science).filter(credits => credits >= 1).length;

  const creditChecks = creditRequirements.map(rule => ({ ...rule,
    value: categoryCredits[rule.id] || 0, complete: (categoryCredits[rule.id] || 0) >= rule.target
  }));
  const coreChecks = requiredCourses.map(rule => ({ ...rule,
    value: rule.courses.filter(id => fulfilled.has(id)).length, target: rule.courses.length,
    complete: rule.courses.every(id => fulfilled.has(id))
  }));
  const recognition = tracks.map(track => {
    const rules = track.rules.map(rule => ({ ...rule, value: totals[rule.metric] ?? 0,
      complete: Number.isFinite(totals[rule.metric]) && totals[rule.metric] >= rule.target
    }));
    return { ...track, rules, complete: rules.length > 0 && rules.every(rule => rule.complete) };
  });
  // Higher recognition levels also need the lower levels to be complete.
  recognition.forEach((track, index) => {
    if (index > 0) track.complete = track.complete && recognition[index - 1].complete;
  });
  const totalComplete = totals.totalCredits >= graduationCredits;
  return {
    ...totals, creditChecks, coreChecks, recognition,
    graduationComplete: totalComplete && creditChecks.every(rule => rule.complete) && coreChecks.every(rule => rule.complete),
    checksMet: Number(totalComplete) + [...creditChecks, ...coreChecks].filter(rule => rule.complete).length,
    checkCount: 1 + creditChecks.length + coreChecks.length,
    missingCredits: courses.filter(course => course.credits === null).length,
    repeatedCourses: completed.length - courses.length
  };
}
