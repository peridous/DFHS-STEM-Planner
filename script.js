const courseSearch = document.querySelector("#course-search");

if (courseSearch) {
  const subjects = document.querySelectorAll(".subject-block");
  const results = document.querySelector("#course-results");

  courseSearch.addEventListener("input", function () {
    const search = courseSearch.value.trim().toLowerCase();
    let matches = 0;

    subjects.forEach(function (subject) {
      let visibleCourses = 0;

      subject.querySelectorAll("li").forEach(function (course) {
        const name = course.querySelector(".class-name").textContent.toLowerCase();
        course.hidden = !name.includes(search);
        if (!course.hidden) visibleCourses++;
      });

      subject.hidden = visibleCourses === 0;
      matches += visibleCourses;
    });

    results.textContent = search ? matches + " courses found" : "";
  });
}

document.querySelectorAll(".qc-card").forEach(function (card) {
  const reflection = card.querySelector(":scope > p");
  const button = card.querySelector(".qc-edit-button");
  const grade = card.querySelector(".qc-grade").textContent.trim();
  const badge = card.querySelector(".qc-pill");
  const storageKey = "quality-credit-" + grade;
  const editor = document.createElement("textarea");
  const message = document.createElement("p");

  editor.className = "qc-editor";
  editor.setAttribute("aria-label", grade + " reflection draft");
  editor.hidden = true;
  message.className = "draft-note";
  message.setAttribute("role", "status");
  reflection.after(editor);
  card.append(message);
  button.textContent = "Edit";

  try {
    const savedDraft = localStorage.getItem(storageKey);
    if (savedDraft !== null) {
      reflection.textContent = savedDraft;
      reflection.removeAttribute("data-empty");
      badge.textContent = "Draft";
      badge.className = "qc-pill draft";
    }
  } catch (error) {
    message.textContent = "Browser storage is unavailable. Drafts won't be saved after you leave.";
  }

  button.addEventListener("click", function () {
    if (editor.hidden) {
      editor.value = reflection.hasAttribute("data-empty") ? "" : reflection.textContent.trim();
      reflection.hidden = true;
      editor.hidden = false;
      button.textContent = "Save draft";
      editor.focus();
      return;
    }

    if (!editor.value.trim()) {
      message.textContent = "Write a reflection before saving.";
      editor.focus();
      return;
    }

    reflection.textContent = editor.value.trim();
    reflection.removeAttribute("data-empty");
    reflection.hidden = false;
    editor.hidden = true;
    button.textContent = "Edit";
    badge.textContent = "Draft";
    badge.className = "qc-pill draft";

    try {
      localStorage.setItem(storageKey, reflection.textContent);
      message.textContent = "Draft saved in this browser.";
    } catch (error) {
      message.textContent = "Couldn't save in this browser. Copy your draft before leaving.";
    }
  });
});
