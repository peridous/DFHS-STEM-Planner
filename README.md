# STEM Planner

A simple course planner for tracking completed classes, graduation progress,
and future course options. Built with HTML, CSS, JavaScript, and Firebase.

## Run locally

Open the project with VS Code Live Server, or run:

```sh
python -m http.server 8000
```

Then visit [localhost:8000](http://localhost:8000).

## Tests

With Node.js 20 or newer:

```sh
npm ci
npm test
```

## Data

Courses come from the Firestore `courses` collection. Edit them in the Firebase
console; the connection settings are in `js/firebase-config.js`.

Class selections and reflection drafts stay in your browser. No sign-in is needed.
Only completed classes count toward earned credits. Graduation requirements are
in `js/requirements-config.js`; all three STEM recognition levels currently use
four years of math as a temporary requirement.
