import {
  defaultCourses, readClasses, writeClasses, readCatalog, writeCatalog,
  validCourseDetails, courseDetails, storageKey, catalogStorageKey
} from "./course-data.js";
import { getSuggestions } from "./suggestion-rules.js";
import { connectFirebase } from "./firebase.js";

const message = document.querySelector("#suggestion-message");
const catalogStatus = document.querySelector("#suggestion-catalog-status");
const retry = document.querySelector("#retry-suggestions");
let classes = new Map();
let catalog = defaultCourses;
let storageReady = true;
let stopCatalog;
let request = 0;
try {
  catalog = readCatalog(localStorage);
} catch {
  // Use starter courses if storage is unavailable.
}

function loadClasses() {
  try {
    classes = readClasses(localStorage);
    if (!storageReady) message.textContent = "";
    storageReady = true;
  } catch {
    storageReady = false;
    message.textContent = "Couldn't read your saved classes. Allow browser storage to add courses to your plan.";
  }
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderList(id, items, emptyMessage) {
  const list = document.getElementById(id);
  list.replaceChildren();
  if (!items.length) list.append(element("li", emptyMessage, "suggestion-empty"));
  for (const { course, reason } of items) {
    const row = element("li", null, "suggestion-row");
    const info = element("div", null, "suggestion-info");
    const heading = element("div", null, "suggestion-course-heading");
    heading.append(element("strong", course.name), element("span", course.level,
      { AP: "tag-ap", Honors: "tag-honors", Other: "tag-other" }[course.level]));
    info.append(heading, element("p", `${course.subject} · ${course.credits} ${course.credits === 1 ? "credit" : "credits"}`, "suggestion-meta"),
      element("p", reason, "suggestion-reason"));
    const button = element("button", "Add to planned", "course-button");
    button.type = "button";
    button.setAttribute("aria-label", `Plan ${course.name}`);
    button.disabled = !storageReady;
    button.addEventListener("click", () => addToPlan(course.id));
    row.append(info, button);
    list.append(row);
  }
}

function render() {
  const suggestions = getSuggestions(classes, catalog);
  renderList("needed-suggestions", suggestions.needed, suggestions.allGraduationCovered
    ? "Your completed, enrolled, and planned classes cover the listed graduation requirements."
    : "No matching courses to suggest right now. Browse Classes for more options.");
  renderList("next-suggestions", suggestions.next,
    "Your next steps may already be listed under Classes you still need. More options appear as you complete courses.");
  document.querySelector("#needed-suggestion-count").textContent = suggestions.needed.length;
  document.querySelector("#next-suggestion-count").textContent = suggestions.next.length;
}

function addToPlan(id) {
  const course = catalog.find(course => course.id === id);
  if (!course) return;
  try {
    // Keep changes made in other tabs.
    const saved = readClasses(localStorage);
    const alreadyListed = [...saved.values()].some(item => item.id === id ||
      courseDetails(catalog.find(course => course.id === item.id) ?? item).creditGroup === course.creditGroup);
    if (alreadyListed) {
      classes = saved;
      message.textContent = `${course.name} is already in your class list.`;
    } else {
      saved.set(id, { ...course, status: "planned", year: "" });
      writeClasses(localStorage, saved);
      classes = saved;
      message.textContent = `${course.name} added to planned classes.`;
    }
    storageReady = true;
    render();
    document.querySelector("#planned-classes-link").focus({ preventScroll: true });
  } catch {
    message.textContent = "Couldn't save this class. Check that browser storage is allowed, then try again.";
  }
}

async function loadCatalog() {
  const current = ++request;
  stopCatalog?.();
  retry.hidden = true;
  catalogStatus.textContent = "Updating available courses...";
  const onError = () => {
    if (current !== request) return;
    catalogStatus.textContent = "Couldn't refresh courses. Using the saved catalog.";
    retry.hidden = false;
  };
  try {
    const firebase = await connectFirebase();
    if (current !== request) return;
    stopCatalog = firebase.watchCourses(snapshot => {
      if (current !== request || (snapshot.metadata.fromCache && snapshot.empty)) return;
      catalog = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
        .filter(course => validCourseDetails(course) && course.active !== false).map(courseDetails);
      try {
        writeCatalog(localStorage, catalog);
      } catch {
        // Caching is optional.
      }
      catalogStatus.textContent = snapshot.metadata.fromCache ? "Using cached course information." : "";
      retry.hidden = true;
      render();
    }, onError);
  } catch {
    onError();
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
    loadClasses();
    render();
  }
});
window.addEventListener("pageshow", () => {
  loadClasses();
  render();
});
retry.addEventListener("click", loadCatalog);
loadClasses();
render();
loadCatalog();
