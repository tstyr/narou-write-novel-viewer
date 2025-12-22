// Firebase設定
// Firebase Consoleで取得した設定をここに入力してください
// https://console.firebase.google.com/

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebaseが利用可能かチェック
let firebaseEnabled = false;

try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    firebaseEnabled = true;
    console.log('Firebase initialized');
  } else {
    console.log('Firebase not configured - sync disabled');
  }
} catch (e) {
  console.error('Firebase init error:', e);
}
