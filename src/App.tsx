import { useEffect, useState } from 'react';
import './App.css';
import { GoogleOAuthProvider } from '@react-oauth/google';
import GoogleLoginButton from './components/GoogleLoginButton';
import {
  clearAutoLogout,
  getToken,
  getUserFromToken,
  isTokenExpired,
  removeToken,
  setupAutoLogout,
} from './components/utils/Auth';
import Profile from './components/Profile';
import api from './api';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const isAdmin = getUserFromToken()?.is_admin;

  useEffect(() => {
    const token = getToken();
    const expired = isTokenExpired();

    if (!token || expired) {
      console.log('❌ 토큰 없음 또는 만료됨 → 자동 로그아웃');
      removeToken();
      setIsAuthenticated(false);
      return;
    }

    setIsAuthenticated(true);

    // ✅ 자동 로그아웃 타이머 예약
    setupAutoLogout(() => {
      handleLogout();
    });
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      console.log('🧹 서버 로그아웃 완료');
    } catch (error) {
      console.error('❌ 로그아웃 요청 실패:', error);
    }

    removeToken();
    clearAutoLogout(); // ✅ 타이머 해제
    setIsAuthenticated(false);
    setShowProfile(false);
    window.location.reload(); // 상태 리셋 + 초기화
    console.log('👋 로그아웃 완료');
  };

  return (
    <GoogleOAuthProvider clientId="465689070189-hr1tl3qm0uamosf0nnf5o06rqo2g35fv.apps.googleusercontent.com">
      <div className="App">
        <h1>Google Login Example</h1>
        {isAuthenticated ? (
          <div>
            <p>✅ 로그인됨!</p>
            <p>🙋‍♂️ 사용자: {getUserFromToken()?.email}</p>
            <button onClick={handleLogout}>로그아웃</button>
            {isAdmin && <button>관리자 페이지</button>}
            <button onClick={() => setShowProfile(true)}>프로필 보기</button>
            {showProfile && <Profile />}
          </div>
        ) : (
          <GoogleLoginButton onLogin={() => setIsAuthenticated(true)} />
        )}
      </div>
    </GoogleOAuthProvider>
  );
};

export default App;
