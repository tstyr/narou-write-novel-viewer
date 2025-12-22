// Firebase設定
const firebaseConfig = {
  apiKey: "AIzaSyANfHINxJ0e4DiVU2LirRBkcnLWFSCk_K0",
  authDomain: "narou-viewer-f92fc.firebaseapp.com",
  projectId: "narou-viewer-f92fc",
  storageBucket: "narou-viewer-f92fc.firebasestorage.app",
  messagingSenderId: "418011990178",
  appId: "1:418011990178:web:8f674481b1925f870e2ffb",
  measurementId: "G-RJRH30EYRR"
};

// Firebaseが利用可能かチェック
let firebaseEnabled = false;

try {
  firebase.initializeApp(firebaseConfig);
  firebaseEnabled = true;
  console.log('Firebase initialized');
} catch (e) {
  console.error('Firebase init error:', e);
}
