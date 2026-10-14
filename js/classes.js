import {
  defaultCourses, statuses, storageKey, validSelection, validCourseDetails,
  readClasses, writeClasses, filterCourses, courseDetails, readCatalog, writeCatalog
} from "./course-data.js";
import { connectFirebase } from "./firebase.js";

const search = document.querySelector("#course-search");
const subjectFilter = document.querySelector("#subject-filter");
const levelFilter = document.querySelector("#level-filter");
const availableOnly = document.querySelector("#available-only");
const addStatus = document.querySelector("#add-status");
const catalog = document.querySelector("#course-catalog");
const message = document.querySelector("#class-message");
const catalogStatus = document.querySelector("#catalog-status");
const retryCatalog = document.querySelector("#retry-catalog");
let classes = loadClasses();
let courses;
try {
  courses = readCatalog(localStorage);
} catch {
  courses = defaultCourses;
}
let hasLiveCatalog = false;
let stopCatalog;
let catalogRequest = 0;

function loadClasses() {
  try {
    return readClasses(localStorage);
  } catch {
    message.textContent = "Couldn't load saved classes. You can still choose classes for this visit.";
    return new Map();
  }
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function courseLabel(course) {
  const label = element("span", null, "course-label");
  const tagClass = { AP: "tag-ap", Honors: "tag-honors", Other: "tag-other" }[course.level];
  const info = element("span", null, "course-info");
  info.append(element("span", course.name, "class-name"), element("small",
    course.credits === null ? "Credits not set" : `${course.credits} ${course.credits === 1 ? "credit" : "credits"}`, "course-credits"));
  label.append(info, element("span", course.level, tagClass));
  return label;
}

function renderClasses() {
  const emptyMessages = {
    completed: "No completed courses yet.",
    enrolled: "No current classes yet.",
    planned: "No planned classes yet."
  };
  for (const status of Object.keys(statuses)) {
    const list = document.querySelector(`#${status}-classes`);
    const selected = [...classes.values()].filter(course => course.status === status)
      .map(saved => ({ ...saved, ...courses.find(course => course.id === saved.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    list.replaceChildren();
    document.querySelector(`#${status}-count`).textContent = selected.length;
    if (!selected.length) list.append(element("li", emptyMessages[status], "empty-classes"));
    for (const course of selected) {
      const row = element("li");
      const controls = element("div", null, "class-controls");
      const select = element("select");
      select.className = "status-choice";
      select.id = `status-${course.id}`;
      select.setAttribute("aria-label", `Status for ${course.name}`);
      for (const [value, text] of Object.entries(statuses)) {
        const option = element("option", text);
        option.value = value;
        select.append(option);
      }
      select.value = course.status;
      select.addEventListener("change", () => {
        saveClass({ ...course, status: select.value });
        document.getElementById(select.id)?.focus({ preventScroll: true });
      });
      const remove = element("button", "Remove", "course-button remove-button");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${course.name}`);
      remove.addEventListener("click", () => saveClass(course, true));
      const year = element("select");
      year.id = `year-${course.id}`;
      year.setAttribute("aria-label", `School year for ${course.name}`);
      for (const [value, text] of [["", "Choose year"], ["before-high-school", "Before high school"], ["9", "9th grade"], ["10", "10th grade"], ["11", "11th grade"], ["12", "12th grade"]]) {
        const option = element("option", text);
        option.value = value;
        year.append(option);
      }
      year.value = course.year || "";
      year.addEventListener("change", () => {
        saveClass({ ...course, year: year.value });
        document.getElementById(year.id)?.focus({ preventScroll: true });
      });
      controls.append(select, year, remove);
      row.append(courseLabel(course), controls);
      list.append(row);
    }
  }
}

function renderCatalog() {
  const matches = filterCourses(courses, classes, search.value, subjectFilter.value,
    levelFilter.value, availableOnly.checked);
  document.querySelector("#course-results").textContent = matches.length
    ? `${matches.length} ${matches.length === 1 ? "course" : "courses"} found`
    : "No courses match these filters. Try clearing them.";
  catalog.replaceChildren();
  let subject;
  let list;
  for (const course of matches) {
    if (subject !== course.subject) {
      subject = course.subject;
      const block = element("div", null, "subject-block");
      list = element("ul", null, "class-list");
      block.append(element("h3", subject), list);
      catalog.append(block);
    }
    const row = element("li");
    const selected = classes.get(course.id);
    const button = element("button", selected ? "Added" : "Add", "course-button");
    button.type = "button";
    button.disabled = Boolean(selected);
    button.setAttribute("aria-label", selected ? `${course.name}: ${statuses[selected.status]}` : `Add ${course.name}`);
    button.addEventListener("click", () => saveClass({ ...course, status: addStatus.value }));
    row.append(courseLabel(course), button);
    list.append(row);
  }
}

function render() {
  renderClasses();
  renderCatalog();
}

function saveClass(course, remove = false) {
  if (!validSelection(course)) return;
  if (remove) classes.delete(course.id);
  else classes.set(course.id, course);
  try {
    writeClasses(localStorage, classes);
    message.textContent = remove ? `${course.name} removed.` : `${course.name} saved as ${statuses[course.status].toLowerCase()}.`;
  } catch {
    message.textContent = "Your choices are kept for this visit. Browser saving is unavailable.";
  }
  render();
}

function updateSubjects() {
  const previous = subjectFilter.value;
  const allSubjects = element("option", "All subjects");
  allSubjects.value = "";
  subjectFilter.replaceChildren(allSubjects);
  for (const subject of [...new Set(courses.map(course => course.subject))].sort()) {
    const option = element("option", subject);
    option.value = subject;
    subjectFilter.append(option);
  }
  subjectFilter.value = [...subjectFilter.options].some(option => option.value === previous) ? previous : "";
}

async function loadCatalog() {
  const request = ++catalogRequest;
  stopCatalog?.();
  retryCatalog.hidden = true;
  catalogStatus.textContent = "Loading available courses...";
  const showError = () => {
    if (request !== catalogRequest) return;
    catalogStatus.textContent = hasLiveCatalog
      ? "Couldn't refresh courses. Showing the last loaded catalog."
      : "Couldn't load the latest courses. Showing starter courses for now.";
    retryCatalog.hidden = false;
  };
  try {
    const firebase = await connectFirebase();
    if (request !== catalogRequest) return;
    stopCatalog = firebase.watchCourses(snapshot => {
      if (request !== catalogRequest) return;
      // An empty cache isn't confirmation that the server's catalog is empty.
      if (snapshot.metadata.fromCache && snapshot.empty) return;
      const records = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      courses = records.filter(course => validCourseDetails(course) && course.active !== false).map(courseDetails);
      try {
        writeCatalog(localStorage, courses);
      } catch {
        // Caching is optional.
      }
      hasLiveCatalog = true;
      catalogStatus.textContent = snapshot.metadata.fromCache ? "Showing cached courses. Waiting for a connection."
        : courses.length ? "Choose a class to add to your list." : "No courses are available yet.";
      retryCatalog.hidden = true;
      updateSubjects();
      render();
    }, showError);
  } catch {
    showError();
  }
}
retryCatalog.addEventListener("click", loadCatalog);
search.addEventListener("input", renderCatalog);
for (const control of [subjectFilter, levelFilter, availableOnly]) {
  control.addEventListener("change", renderCatalog);
}
document.querySelector("#clear-filters").addEventListener("click", () => {
  search.value = subjectFilter.value = levelFilter.value = "";
  availableOnly.checked = false;
  renderCatalog();
  search.focus();
});
window.addEventListener("storage", event => {
  if (event.key === storageKey || event.key === null) {
    classes = loadClasses();
    render();
  }
});

updateSubjects();
render();
loadCatalog();
