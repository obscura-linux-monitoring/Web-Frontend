import axios, { AxiosInstance } from 'axios';
import { getToken, removeToken, saveToken } from './utils/Auth';

const api: AxiosInstance = axios.create({
    baseURL: 'http://1.209.148.143:8000',
    withCredentials: true, // 모든 요청에 자동 적용!
});

// 토큰 갱신 중인지 확인하는 플래그
let isRefreshing = false;
// 토큰 갱신 대기 중인 요청들을 저장하는 배열
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}> = [];

// 대기 중인 요청들 처리 함수
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  
  failedQueue = [];
};

// 원래 형식
// api.post('/auth/logout', null, {
//     withCredentials: true
// });  

// ✅ 요청 전에 access token 붙이기
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ✅ 응답 에러 처리 (401 → 토큰 재발급 시도)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // /auth/refresh 요청 자체가 실패한 경우는 바로 로그아웃 처리
    if (originalRequest.url?.includes('/auth/refresh')) {
      console.log('🔒 Refresh token이 만료되었거나 유효하지 않음');
      isRefreshing = false;
      processQueue(error, null);
      removeToken();
      window.location.href = '/login'; // 로그인 페이지로 리다이렉트
      return Promise.reject(error);
    }

    // 401 에러이고 아직 재시도하지 않은 요청인 경우
    if (error.response?.status === 401 && !originalRequest._retry) {
      // 이미 토큰 갱신 중인 경우 대기
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return axios(originalRequest);
        }).catch((err) => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        console.log('🔄 Access Token 만료 감지, Refresh 시도...');
        
        // 새로운 axios 인스턴스로 refresh 요청 (인터셉터 우회)
        const refreshInstance = axios.create({
          baseURL: 'http://1.209.148.143:8000',
          withCredentials: true,
        });

        const response = await refreshInstance.post('/auth/refresh');
        const newToken = response.data.access_token;
        
        console.log('✅ Refresh 성공, 새 토큰 저장');
        saveToken(newToken);
        processQueue(null, newToken);
        isRefreshing = false;

        // 원래 요청 재시도
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axios(originalRequest);
        
      } catch (refreshError: any) {
        console.error('❌ Refresh 실패:', {
          status: refreshError?.response?.status,
          message: refreshError?.response?.data?.detail || refreshError?.message,
          hasCookie: document.cookie.includes('refresh_token')
        });
        processQueue(refreshError, null);
        isRefreshing = false;
        removeToken();
        
        // 로그인 페이지로 리다이렉트 (새로고침 대신)
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
