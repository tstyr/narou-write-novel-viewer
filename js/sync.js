// クラウド同期機能
const CloudSync = {
  user: null,
  db: null,
  lastSyncTime: 0,

  init() {
    if (!firebaseEnabled) {
      this.hideLoginUI();
      return;
    }

    this.db = firebase.firestore();
    
    // 認証状態の監視
    firebase.auth().onAuthStateChanged((user) => {
      this.user = user;
      this.updateUI();
      
      if (user) {
        this.pullFromCloud();
      }
    });
  },

  hideLoginUI() {
    const loginBtn = document.getElementById('login-btn');
    const userSection = document.getElementById('user-section');
    if (loginBtn) loginBtn.style.display = 'none';
    if (userSection) userSection.style.display = 'none';
  },

  updateUI() {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const loginPrompt = document.getElementById('login-prompt');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    if (this.user) {
      loginBtn.textContent = '✓';
      loginBtn.title = this.user.displayName || 'ログイン中';
      userInfo.classList.remove('hidden');
      loginPrompt.style.display = 'none';
      
      if (this.user.photoURL) {
        userAvatar.src = this.user.photoURL;
        userAvatar.style.display = 'block';
      }
      userName.textContent = this.user.displayName || this.user.email;
    } else {
      loginBtn.textContent = '👤';
      loginBtn.title = 'ログイン';
      userInfo.classList.add('hidden');
      loginPrompt.style.display = 'block';
    }
  },

  async loginWithGoogle() {
    if (!firebaseEnabled) {
      alert('Firebase設定が必要です。firebase-config.jsを設定してください。');
      return;
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await firebase.auth().signInWithPopup(provider);
    } catch (e) {
      console.error('Login error:', e);
      if (e.code !== 'auth/popup-closed-by-user') {
        alert('ログインに失敗しました: ' + e.message);
      }
    }
  },

  async logout() {
    try {
      await firebase.auth().signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
  },

  // ローカルデータをクラウドにプッシュ
  async pushToCloud() {
    if (!this.user || !this.db) return;

    try {
      const settings = Settings.get();
      const userDoc = this.db.collection('users').doc(this.user.uid);
      
      // 読書統計も含める
      const statsData = typeof ReadingStats !== 'undefined' ? ReadingStats.getForSync() : null;
      
      await userDoc.set({
        progress: settings.progress || {},
        history: settings.history || [],
        readingSpeed: settings.readingSpeed || 500,
        readingStats: statsData,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: Date.now()
      }, { merge: true });

      this.lastSyncTime = Date.now();
      console.log('Pushed to cloud');
      return true;
    } catch (e) {
      console.error('Push error:', e);
      return false;
    }
  },

  // クラウドからデータをプル
  async pullFromCloud() {
    if (!this.user || !this.db) return;

    try {
      const userDoc = await this.db.collection('users').doc(this.user.uid).get();
      
      if (userDoc.exists) {
        const cloudData = userDoc.data();
        const localSettings = Settings.get();
        
        // クラウドの方が新しい場合はマージ
        const cloudTime = cloudData.updatedAt || 0;
        const localTime = localSettings.lastUpdated || 0;
        
        if (cloudTime > localTime) {
          // 履歴をマージ（重複を除去）
          const mergedHistory = this.mergeHistory(
            localSettings.history || [],
            cloudData.history || []
          );
          
          // 進捗をマージ（より進んでいる方を採用）
          const mergedProgress = this.mergeProgress(
            localSettings.progress || {},
            cloudData.progress || {}
          );
          
          Settings.update('history', mergedHistory);
          Settings.update('progress', mergedProgress);
          Settings.update('lastUpdated', Date.now());
          
          if (cloudData.readingSpeed) {
            Settings.update('readingSpeed', cloudData.readingSpeed);
          }
          
          // 読書統計をマージ
          if (cloudData.readingStats && typeof ReadingStats !== 'undefined') {
            ReadingStats.mergeFromCloud(cloudData.readingStats);
          }
          
          console.log('Pulled from cloud');
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error('Pull error:', e);
      return false;
    }
  },

  // 履歴をマージ
  mergeHistory(local, cloud) {
    const merged = [...local];
    const localIds = new Set(local.map(h => h.id));
    
    for (const item of cloud) {
      if (!localIds.has(item.id)) {
        merged.push(item);
      } else {
        // 同じIDがある場合、より新しい方を採用
        const localItem = merged.find(h => h.id === item.id);
        if (localItem && item.lastRead > localItem.lastRead) {
          Object.assign(localItem, item);
        }
      }
    }
    
    // 最新順にソートして最大数に制限
    return merged
      .sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0))
      .slice(0, Settings.maxHistory);
  },

  // 進捗をマージ
  mergeProgress(local, cloud) {
    const merged = { ...local };
    
    for (const [novelId, cloudProgress] of Object.entries(cloud)) {
      const localProgress = merged[novelId];
      
      if (!localProgress) {
        merged[novelId] = cloudProgress;
      } else {
        // より進んでいる方を採用
        if (cloudProgress.chapterIndex > localProgress.chapterIndex ||
            (cloudProgress.chapterIndex === localProgress.chapterIndex && 
             cloudProgress.pageIndex > localProgress.pageIndex)) {
          merged[novelId] = cloudProgress;
        }
      }
    }
    
    return merged;
  },

  // 同期実行
  async sync() {
    if (!this.user) return false;
    
    const pulled = await this.pullFromCloud();
    const pushed = await this.pushToCloud();
    
    return pulled || pushed;
  }
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  CloudSync.init();
});
