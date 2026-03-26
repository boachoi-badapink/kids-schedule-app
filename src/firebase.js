// ─── Firebase 설정 ───

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCR0szlA2SOw78yQcoDcc3HPSf9wjvJ7HE",
  authDomain: "kids-schedule-a67bd.firebaseapp.com",
  projectId: "kids-schedule-a67bd",
  storageBucket: "kids-schedule-a67bd.firebasestorage.app",
  messagingSenderId: "423479743556",
  appId: "1:423479743556:web:32e3ebdfc5b0057c01d811",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
