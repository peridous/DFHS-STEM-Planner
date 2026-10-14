const creditCategories = {
  English: "english",
  Math: "math",
  Science: "science",
  "Foreign Language": "language",
  Tech: "electives",
  Arts: "electives"
};

export const defaultCourses = [
  { id: "ap-biology", name: "AP Biology", subject: "Science", level: "AP", fulfills: ["biology"] },
  { id: "honors-physics", name: "Honors Physics", subject: "Science", level: "Honors" },
  { id: "ap-chemistry", name: "AP Chemistry", subject: "Science", level: "AP" },
  { id: "chemistry", name: "Chemistry", subject: "Science", level: "Other" },
  { id: "ap-physics-c", name: "AP Physics C", subject: "Science", level: "AP" },
  { id: "ap-environmental-science", name: "AP Environmental Science", subject: "Science", level: "AP" },
  { id: "biology-1-hn", name: "Biology 1 HN", subject: "Science", level: "Honors", fulfills: ["biology"], creditGroup: "biology-1" },
  { id: "biology-1", name: "Biology 1", subject: "Science", level: "Other", fulfills: ["biology"] },
  { id: "stem-programming-1-hn", name: "STEM Computer Programming 1 HN", subject: "Tech", level: "Honors" },
  { id: "ap-cs-principles", name: "AP Computer Science - Principles", subject: "Tech", level: "AP" },
  { id: "game-design-hn", name: "Game Design HN", subject: "Tech", level: "Honors" },
  { id: "biosystems-1-hn", name: "Biosystems Technology 1 HN", subject: "Tech", level: "Honors" },
  { id: "aerospace-science-3", name: "Aerospace Science 3", subject: "Tech", level: "Other" },
  { id: "algebra-1-hn", name: "Algebra 1 HN", subject: "Math", level: "Honors", fulfills: ["algebra-1"], creditGroup: "algebra-1" },
  { id: "algebra-2", name: "Algebra 2", subject: "Math", level: "Other", fulfills: ["algebra-2"] },
  { id: "ap-pre-calculus", name: "AP Pre-Calculus", subject: "Math", level: "AP" },
  { id: "vector-calculus", name: "Vector Calculus", subject: "Math", level: "Other" },
  { id: "masterclass-orchestra", name: "Masterclass Orchestra", subject: "Arts", level: "Other" },
  { id: "english-1-hn", name: "English I Honors", subject: "English", level: "Honors", fulfills: ["english-1"], creditGroup: "english-1" },
  { id: "english-2-hn", name: "English II Honors", subject: "English", level: "Honors", fulfills: ["english-2"], creditGroup: "english-2" },
  { id: "english-3", name: "English III", subject: "English", level: "Other" },
  { id: "english-4", name: "English IV", subject: "English", level: "Other" },
  { id: "geometry-hn", name: "Geometry Honors", subject: "Math", level: "Honors", creditGroup: "geometry" },
  { id: "spanish-1", name: "Spanish I", subject: "Foreign Language", level: "Other" },
  { id: "spanish-2", name: "Spanish II", subject: "Foreign Language", level: "Other" },
  { id: "world-history", name: "World History", subject: "Social Studies", level: "Other", fulfills: ["world-history"] },
  { id: "engineering-design-hn", name: "Engineering Design Honors", subject: "Tech", level: "Honors" },
  { id: "ap-cs-a", name: "AP Computer Science A", subject: "Tech", level: "AP" },
  { id: "ap-calculus-bc", name: "AP Calculus BC", subject: "Math", level: "AP" }
].map(course => ({ credits: 1, category: creditCategories[course.subject] || "other", fulfills: [], creditGroup: course.id, ...course }));

export const categories = ["english", "math", "science", "language", "electives", "other"];
export const coreCourses = ["english-1", "english-2", "algebra-1", "algebra-2", "biology", "world-history"];
export const schoolYears = ["", "before-high-school", "9", "10", "11", "12"];
export const catalogStorageKey = "stem-planner-catalog";

export const statuses = {
  planned: "Planned",
  enrolled: "Currently enrolled",
  completed: "Completed"
};

export const storageKey = "stem-planner-classes";

export function validCourse(course) {
  return course && typeof course.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(course.id)
    && typeof course.name === "string" && course.name.trim().length > 0 && course.name.length <= 200
    && typeof course.subject === "string" && course.subject.trim().length > 0 && course.subject.length <= 80
    && ["AP", "Honors", "Other"].includes(course.level);
}

export function validCourseDetails(course) {
  return validCourse(course)
    && (course.credits === undefined || course.credits === null || (Number.isFinite(course.credits) && course.credits >= 0 && course.credits <= 4))
    && (course.category === undefined || categories.includes(course.category))
    && (course.fulfills === undefined || (Array.isArray(course.fulfills) && course.fulfills.every(id => coreCourses.includes(id))))
    && (course.creditGroup === undefined || (typeof course.creditGroup === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(course.creditGroup)));
}

export function courseDetails(course) {
  const known = defaultCourses.find(item => item.id === course.id);
  return {
    id: course.id, name: course.name, subject: course.subject, level: course.level,
    credits: course.credits !== undefined ? course.credits : known?.credits ?? null,
    category: course.category ?? known?.category ?? creditCategories[course.subject] ?? "other",
    fulfills: course.fulfills ?? known?.fulfills ?? [],
    creditGroup: course.creditGroup ?? known?.creditGroup ?? course.id
  };
}

export function readCatalog(storage) {
  const saved = JSON.parse(storage.getItem(catalogStorageKey) || "null");
  if (!Array.isArray(saved) || !saved.every(validCourseDetails)) return defaultCourses;
  return saved.map(courseDetails);
}

export function writeCatalog(storage, courses) {
  storage.setItem(catalogStorageKey, JSON.stringify(courses));
}

export function validSelection(course) {
  return validCourseDetails(course) && Object.hasOwn(statuses, course.status)
    && (course.year === undefined || schoolYears.includes(course.year));
}

export function readClasses(storage) {
  const saved = JSON.parse(storage.getItem(storageKey) || "[]");
  if (!Array.isArray(saved) || !saved.every(validSelection)) {
    throw new Error("Invalid saved class list");
  }
  return new Map(saved.map(course => [course.id, { ...courseDetails(course), status: course.status, year: course.year ?? "" }]));
}

export function writeClasses(storage, classes) {
  storage.setItem(storageKey, JSON.stringify([...classes.values()]));
}

export function filterCourses(courses, classes, search, subject, level, availableOnly) {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return courses.filter(course => {
    const text = `${course.name} ${course.subject} ${course.level}`.toLowerCase();
    return words.every(word => text.includes(word))
      && (!subject || course.subject === subject)
      && (!level || course.level === level)
      && (!availableOnly || !classes.has(course.id));
  }).sort((a, b) => a.subject.localeCompare(b.subject) || a.name.localeCompare(b.name));
}
