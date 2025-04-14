import { useEffect, useState } from 'react';
import {
  getToken,
  getUserFromToken,
  isTokenExpired,
  removeToken,
  setupAutoLogout,
  clearAutoLogout,
  clearUserSession,
} from '../components/utils/Auth';
import api from '../api';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const user = getUserFromToken();
  const isAdmin = user?.is_admin;

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

    clearUserSession();
    removeToken();
    clearAutoLogout();
    setIsAuthenticated(false);
    setShowProfile(false);
    window.location.reload();
  };

  return {
    isAuthenticated,
    showProfile,
    setShowProfile,
    isAdmin,
    user,
    handleLogout,
  };
};
