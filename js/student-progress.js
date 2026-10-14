import {
  readClasses, readCatalog, writeCatalog, courseDetails, validCourseDetails,
  storageKey, catalogStorageKey, defaultCourses
} from "./course-data.js";
import { calculateProgress } from "./progress.js";
import { graduationCredits } from "./requirements-config.js";
import { connectFirebase } from "./firebase.js";

let catalog = defaultCourses;
try {
  catalog = readCatalog(localStorage);
} catch {
  // Use starter courses if storage is unavailable.
}
const message = document.querySelector("#progress-message");
let catalogError = "";

function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function renderRules(id, rules, credits = false) {
  const list = document.getElementById(id);
  if (!list) return;
  list.replaceChildren();
  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = `requirement-row ${rule.complete ? "completed" : "pending"}`;
    row.dataset.requirement = rule.id;
    const icon = document.createElement("span");
    icon.className = "check-icon";
    icon.textContent = rule.complete ? "\u2713" : "\u25cb";
    icon.setAttribute("aria-hidden", "true");
    const detail = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = rule.label;
    const description = document.createElement("p");
    description.textContent = `${rule.value} / ${rule.target} ${credits ? "credits" : rule.metric?.endsWith("Years") ? "school years" : "courses"} completed`;
    if (rule.complete) description.textContent += " - Requirement met";
    detail.append(label, description);
    row.append(icon, detail);
    list.append(row);
  }
}

function renderProgress() {
  let classes;
  let storageError = "";
  try {
    classes = readClasses(localStorage);
  } catch {
    classes = new Map();
    storageError = "Couldn't read saved classes. These totals don't include your unsaved choices.";
  }
  const progress = calculateProgress(classes, catalog);
  text("total-credits", progress.totalCredits);
  text("graduation-total", `${progress.totalCredits} / ${graduationCredits}`);
  text("graduation-state", progress.graduationComplete ? "All listed graduation requirements met" : "credits completed");
  text("overview-progress", `${progress.totalCredits} / ${graduationCredits} credits completed. ${progress.checksMet} / ${progress.checkCount} listed graduation checks met.`);
  const bar = document.querySelector("#graduation-progress");
  if (bar) {
    bar.max = graduationCredits;
    bar.value = Math.min(progress.totalCredits, graduationCredits);
  }
  renderRules("credit-requirements", progress.creditChecks, true);
  renderRules("core-requirements", progress.coreChecks);
  const scholar = progress.recognition.find(track => track.id === "scholar");
  const honors = progress.recognition.find(track => track.id === "honors");
  text("scholar-total", `${scholar.rules.filter(rule => rule.complete).length} / ${scholar.rules.length}`);
  text("scholar-state", "requirements completed");
  text("honors-total", `${honors.rules.filter(rule => rule.complete).length} / ${honors.rules.length}`);
  text("honors-state", "requirements completed");
  renderRules("honors-requirements", honors.rules);
  for (const track of progress.recognition) {
    const milestone = document.querySelector(`[data-track="${track.id}"]`);
    if (milestone) {
      milestone.classList.toggle("completed", track.complete);
      milestone.setAttribute("aria-label", `${track.label}: ${track.complete ? "requirements met" : "in progress"}`);
      milestone.title = track.complete ? "Requirements met" : "In progress";
    }
  }
  text("recognition-note", `${progress.mathYears} / 4 math years completed. For now, all three STEM recognition levels use this requirement.`);
  const notes = [storageError, catalogError];
  if (progress.missingCredits) notes.push(`${progress.missingCredits} completed ${progress.missingCredits === 1 ? "class needs" : "classes need"} credit information before being counted.`);
  if (progress.repeatedCourses) notes.push("Course variants with the same credit group count once.");
  if (message) message.textContent = notes.filter(Boolean).join(" ");
}

async function loadCatalog() {
  try {
    const firebase = await connectFirebase();
    firebase.watchCourses(snapshot => {
      if (snapshot.metadata.fromCache && snapshot.empty) return;
      catalog = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
        .filter(course => validCourseDetails(course) && course.active !== false).map(courseDetails);
      try {
        writeCatalog(localStorage, catalog);
      } catch {
        // Caching is optional.
      }
      catalogError = snapshot.metadata.fromCache ? "Using cached course information." : "";
      renderProgress();
    }, () => {
      catalogError = "Couldn't refresh course information. Using saved course details.";
      renderProgress();
    });
  } catch {
    catalogError = "Couldn't refresh course information. Using saved course details.";
    renderProgress();
  }
}

window.addEventListener("storage", event => {
  if ([storageKey, catalogStorageKey, null].includes(event.key)) {
    if (event.key !== storageKey) {
      try {
        catalog = readCatalog(localStorage);
      } catch {
        // Keep the current catalog.
      }
    }
    renderProgress();
  }
});
window.addEventListener("pageshow", renderProgress);
renderProgress();
loadCatalog();
