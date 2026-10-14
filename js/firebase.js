import { firebaseConfig } from "./firebase-config.js";

export async function connectFirebase() {
  const [appSdk, dbSdk] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js")
  ]);

  const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(firebaseConfig);
  const db = dbSdk.getFirestore(app);

  return {
    watchCourses(callback, onError) {
      return dbSdk.onSnapshot(dbSdk.collection(db, "courses"),
        { includeMetadataChanges: true }, callback, onError);
    }
  };
}
