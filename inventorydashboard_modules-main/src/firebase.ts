// src/firebase.ts

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const {
  VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID,
} = import.meta.env as Record<string, string | undefined>;

if (!VITE_FIREBASE_API_KEY) {
  console.warn(
    "⚠️ Warning: Missing VITE_FIREBASE_API_KEY in environment. Please add Firebase keys to your .env file."
  );
}

const firebaseConfig = {
  apiKey: VITE_FIREBASE_API_KEY || "AIzaSyDRbp4ZLkt5BZa7ogJtpm1RAV5lFbIaoxo",
  authDomain: VITE_FIREBASE_AUTH_DOMAIN || "ibots-dashboard.firebaseapp.com",
  projectId: VITE_FIREBASE_PROJECT_ID || "ibots-dashboard",
  storageBucket: VITE_FIREBASE_STORAGE_BUCKET || "ibots-dashboard.firebasestorage.app",
  messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID || "453010453641",
  appId: VITE_FIREBASE_APP_ID || "1:453010453641:web:db7c1e212b45092b208258",
};

const app = initializeApp(firebaseConfig);
export { app }; // <-- added export for functions client
export const auth = getAuth(app);
export const db = getFirestore(app);
