import axios, { AxiosInstance } from 'axios';
import { getToken, removeToken, saveToken } from './components/utils/Auth';

const api: AxiosInstance = axios.create({
    baseURL: 'http://1.209.148.143:8000',
    withCredentials: true, // 모든 요청에 자동 적용!
});

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

    // 토큰 만료로 401 떴고, 재시도한 요청이 아닌 경우
    if (
      error.response?.status === 401 &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        const res = await api.post(
          '/auth/refresh',
          null,
          { withCredentials: true }
        );

        const newToken = res.data.access_token;
        saveToken(newToken); // ✅ localStorage에 저장

        // 🔁 새 토큰으로 헤더 갱신 후 재요청
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axios(originalRequest);
      } catch (refreshError) {
        console.error('🔒 Refresh 실패:', refreshError);
        removeToken(); // access token 제거
        window.location.reload(); // 강제 로그아웃
      }
    }

    return Promise.reject(error);
  }
);

export default api;
