// 통합된 인증 Context
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import api from '../api';
import { 
  getToken, saveToken, removeToken, 
  getUserInfo, saveUserInfo, removeUserInfo 
} from '../utils/Auth';
import { createAuthenticatedWebSocket } from '../utils/websocket';

// JWT 페이로드 타입
export type JwtPayload = {
  sub: string;
  email: string;
  exp: number;
  is_admin?: boolean;
};

// Context 값 타입
interface AuthContextType {
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  user: JwtPayload | null;
  userInfo: any | null;
  login: (googleToken: string) => Promise<void>;
  handleLogout: () => void;
  refreshToken: () => Promise<boolean>;
  createAuthenticatedWebSocket: (path: string, handlers?: any) => WebSocket | null;
}

// Context 생성
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider 컴포넌트
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<JwtPayload | null>(null);
  const [userInfo, setUserInfo] = useState<any | null>(null);
  
  // 로그아웃 타이머 참조
  const logoutTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 토큰에서 사용자 정보 추출
  const parseToken = useCallback((token: string) => {
    try {
      return jwtDecode<JwtPayload>(token);
    } catch (err) {
      console.error('토큰 디코딩 실패:', err);
      return null;
    }
  }, []);
  
  // 초기화: 저장된 토큰으로 인증 상태 복원
  useEffect(() => {
    const initAuth = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      
      const userData = parseToken(token);
      if (!userData || userData.exp < Date.now() / 1000) {
        // 만료된 토큰은 갱신 시도
        const refreshed = await refreshToken();
        if (!refreshed) {
          handleLogout();
        }
      } else {
        // 유효한 토큰이면 사용자 정보 설정
        setUser(userData);
        setIsAdmin(!!userData.is_admin);
        setIsAuthenticated(true);
        setUserInfo(getUserInfo());
      }
      
      setLoading(false);
    };
    
    initAuth();
    
    return () => {
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
      }
    };
  }, []);
  
  // 토큰 갱신
  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const response = await api.post('/auth/refresh', null, { withCredentials: true });
      const newToken = response.data.access_token;
      
      saveToken(newToken);
      
      const userData = parseToken(newToken);
      if (userData) {
        setUser(userData);
        setIsAdmin(!!userData.is_admin);
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('토큰 갱신 실패:', error);
      return false;
    }
  }, [parseToken]);
  
  // 로그인 처리
  const login = useCallback(async (googleToken: string) => {
    setLoading(true);
    
    try {
      const response = await api.post('/auth/google', { id_token: googleToken });
      const { access_token, user_info } = response.data;
      
      saveToken(access_token);
      
      if (user_info) {
        saveUserInfo(user_info);
        setUserInfo(user_info);
      }
      
      const userData = parseToken(access_token);
      if (userData) {
        setUser(userData);
        setIsAdmin(!!userData.is_admin);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('로그인 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [parseToken]);
  
  // 로그아웃 처리
  const handleLogout = useCallback(() => {
    api.post('/auth/logout').catch(err => 
      console.warn('로그아웃 API 호출 실패:', err)
    );
    
    removeToken();
    removeUserInfo();
    setUser(null);
    setUserInfo(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
    
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
    }
  }, []);
  
  const contextValue: AuthContextType = {
    isAuthenticated,
    isAdmin,
    loading,
    user,
    userInfo,
    login,
    handleLogout,
    refreshToken,
    createAuthenticatedWebSocket
  };
  
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Context 사용을 위한 훅
export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};