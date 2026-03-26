// ─── Firebase 설정 ───
// 아래 값을 본인의 Firebase 프로젝트 설정으로 교체하세요.
// Firebase Console → 프로젝트 설정 → 일반 → "내 앱" 에서 확인 가능합니다.

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "여기에_본인의_API_KEY를_넣으세요",
  authDomain: "여기에_본인의_프로젝트.firebaseapp.com",
  projectId: "여기에_본인의_프로젝트_ID",
  storageBucket: "여기에_본인의_프로젝트.firebasestorage.app",
  messagingSenderId: "여기에_본인의_SENDER_ID",
  appId: "여기에_본인의_APP_ID",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
