import { jwtDecode } from "jwt-decode";

const TOKEN_KEY = "jwt";
const USER_INFO_KEY = "userInfo";

type JwtPayload = {
  sub: string;
  email: string;
  exp: number;
  is_admin?: boolean;
};

type UserInfo = {
  id?: string;
  email?: string;
  name?: string;
  picture?: string; // 프로필 이미지 URL
  [key: string]: any;
};

// JWT토큰 가져오기
export const getToken = () => localStorage.getItem(TOKEN_KEY);

// JWT토큰 저장
export const saveToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);

// JWT토큰 삭제
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);

// JWT토큰에서 사용자 정보 가져오기
export const getUserFromToken = (): JwtPayload | null => {
  try {
    const token = getToken();
    return token ? jwtDecode<JwtPayload>(token) : null;
  } catch (err) {
    console.error("❌ 디코딩 실패:", err);
    return null;
  }
};

// 사용자 정보 관련 함수들
export const getUserInfo = (): UserInfo | null => {
  try {
    const userInfo = localStorage.getItem(USER_INFO_KEY);
    
    if (!userInfo) {
      console.warn("⚠️ localStorage에 userInfo가 없습니다");
      return null;
    }
    
    const parsedUserInfo = JSON.parse(userInfo);
    
    return parsedUserInfo;
  } catch (err) {
    console.error("❌ 사용자 정보 파싱 실패:", err);
    return null;
  }
};

export const saveUserInfo = (userInfo: UserInfo) => {
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
};

export const removeUserInfo = () => {
  localStorage.removeItem(USER_INFO_KEY);
};

// getUserProfileImage 함수 수정
export const getUserProfileImage = (): string | null => {
  const userInfo = getUserInfo();
  console.log("🔍 getUserProfileImage에서 받은 userInfo:", userInfo);
  
  if (!userInfo) {
    console.warn("⚠️ userInfo가 없습니다");
    return null;
  }
  
  // 다양한 이미지 필드 이름을 시도합니다
  const imageUrl = userInfo.picture || userInfo.image || userInfo.avatar || userInfo.profileImage;
  console.log("🖼️ 발견된 이미지 URL:", imageUrl || "이미지 URL이 없습니다");
  return imageUrl || null;
};

// 로그아웃 시 사용자 정보도 함께 삭제
export const clearUserSession = () => {
  removeToken();
  removeUserInfo();
  clearAutoLogout();
};

// JWT토큰 만료 여부 확인
export const isTokenExpired = (): boolean => {
  const token = getToken();
  try {
    const { exp } = token ? jwtDecode<JwtPayload>(token) : { exp: 0 };
    return !exp || exp < Date.now() / 1000;
  } catch {
    return true;
  }
};

// 로그인 여부 확인
export const isLoggedIn = () => !!getToken() && !isTokenExpired();

// 자동 로그아웃 타이머 설정
let logoutTimer: ReturnType<typeof setTimeout> | null = null;

// 자동 로그아웃 설정
export const setupAutoLogout = (logoutCallback: () => void) => {
  const token = getToken();
  if (!token) return;

  try {
    const { exp } = jwtDecode<JwtPayload>(token);
    const now = Date.now() / 1000;
    const remainingTime = (exp - now) * 1000;

    console.log("🕒 JWT exp:", exp, "현재:", now, "남은 시간(ms):", remainingTime);

    if (logoutTimer) clearTimeout(logoutTimer);

    logoutTimer = setTimeout(() => {
      console.warn("🔐 access token 만료 → 자동 로그아웃");
      logoutCallback();
    }, remainingTime);
  } catch (err) {
    console.error("❌ 자동 로그아웃 타이머 설정 실패:", err);
  }
};


// 자동 로그아웃 해제
export const clearAutoLogout = () => {
  if (logoutTimer) clearTimeout(logoutTimer);
};
