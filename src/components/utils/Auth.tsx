import { jwtDecode } from "jwt-decode";

const TOKEN_KEY = "jwt";

type JwtPayload = {
  sub: string;
  email: string;
  exp: number;
  is_admin?: boolean;
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
