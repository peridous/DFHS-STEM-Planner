export const graduationCredits = 24;
export const creditRequirements = [
  { id: "english", label: "English", target: 4 },
  { id: "math", label: "Math", target: 4 },
  { id: "science", label: "Science", target: 3 },
  { id: "language", label: "Foreign Language", target: 2 },
  { id: "electives", label: "Electives", target: 4 }
];

export const requiredCourses = [
  { id: "english", label: "English I & II", courses: ["english-1", "english-2"] },
  { id: "algebra", label: "Algebra I & II", courses: ["algebra-1", "algebra-2"] },
  { id: "biology", label: "Biology", courses: ["biology"] },
  { id: "history", label: "World History", courses: ["world-history"] }
];

// Temporary recognition rule: use four years of math for every tier.
export const recognitionTracks = [
  { id: "stem", label: "STEM" },
  { id: "scholar", label: "STEM Scholar" },
  { id: "honors", label: "STEM Scholar with Honors" }
].map(track => ({ ...track,
  rules: [{ id: "math-years", label: "4 Years of Math", metric: "mathYears", target: 4 }]
}));
