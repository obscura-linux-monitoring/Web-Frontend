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

/**
 * 🚀 메인 App 컴포넌트
 * 애플리케이션의 인증 상태 관리와 UI 렌더링을 담당
 */
const App = () => {
  // 🔐 인증 관련 상태
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const isAdmin = getUserFromToken()?.is_admin; // 👑 관리자 권한 확인

  /**
   * 🔄 컴포넌트 마운트 시 자동 로그인 처리
   * 토큰 유효성 검사 및 자동 로그아웃 타이머 설정
   */
  useEffect(() => {
    const token = getToken();
    const expired = isTokenExpired();

    // 🛑 토큰이 없거나 만료된 경우 로그아웃 처리
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

  /**
   * 👋 로그아웃 처리 함수
   * 서버에 로그아웃 요청 후 클라이언트 상태 초기화
   */
  const handleLogout = async () => {
    try {
      // 🔌 서버 로그아웃 API 호출
      await api.post('/auth/logout');
      console.log('🧹 서버 로그아웃 완료');
    } catch (error) {
      console.error('❌ 로그아웃 요청 실패:', error);
    }

    // 🧹 클라이언트 상태 정리
    removeToken();
    clearAutoLogout(); // ⏱️ 타이머 해제
    setIsAuthenticated(false);
    setShowProfile(false);
    window.location.reload(); // 🔄 상태 리셋 + 초기화
    console.log('👋 로그아웃 완료');
  };

  return (
    <GoogleOAuthProvider clientId="465689070189-hr1tl3qm0uamosf0nnf5o06rqo2g35fv.apps.googleusercontent.com">
      <div className="App">
        <h1>Google Login Example</h1>
        {/* 🔐 조건부 렌더링: 인증 상태에 따라 다른 UI 표시 */}
        {isAuthenticated ? (
          <div>
            <p>✅ 로그인됨!</p>
            <p>🙋‍♂️ 사용자: {getUserFromToken()?.email}</p>
            <button onClick={handleLogout}>로그아웃</button>
            {/* 👑 관리자 전용 버튼 */}
            {isAdmin && <button>관리자 페이지</button>}
            <button onClick={() => setShowProfile(true)}>프로필 보기</button>
            {/* 📋 프로필 컴포넌트 조건부 렌더링 */}
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
