import { getToken } from './Auth';

interface WebSocketHandlers {
  onOpen?: (event: Event) => void;
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
}

/**
 * JWT 인증을 사용하여 WebSocket 연결을 생성합니다.
 * @param path WebSocket 엔드포인트 경로
 * @param handlers WebSocket 이벤트 핸들러
 * @returns 생성된 WebSocket 객체 또는 실패 시 null
 */
export const createAuthenticatedWebSocket = (path: string, handlers: WebSocketHandlers = {}): WebSocket | null => {
  // JWT 토큰 가져오기
  const token = getToken();
  
  if (!token) {
    console.error('❌ WebSocket 인증 실패: JWT 토큰을 찾을 수 없습니다');
    return null;
  }
  
  try {
    // 토큰을 URL 쿼리 파라미터로 추가
    const encodedToken = encodeURIComponent(token);
    const wsUrl = `ws://1.209.148.143:8000${path}?token=${encodedToken}`;
    
    console.log(`🔄 WebSocket 연결 시도: ${path}`);
    const socket = new WebSocket(wsUrl);
    
    // 이벤트 핸들러 설정
    socket.onopen = (event) => {
      console.log(`✅ WebSocket 연결 성공: ${path}`);
      if (handlers.onOpen) handlers.onOpen(event);
    };
    
    socket.onmessage = (event) => {
      if (handlers.onMessage) handlers.onMessage(event);
    };
    
    socket.onerror = (event) => {
      console.error('❌ WebSocket 에러:', event);
      if (handlers.onError) handlers.onError(event);
    };
    
    socket.onclose = (event) => {
      console.log(`🔌 WebSocket 연결 종료 (코드: ${event.code}, 이유: ${event.reason || '없음'})`);
      if (handlers.onClose) handlers.onClose(event);
    };
    
    return socket;
  } catch (error) {
    console.error('❌ WebSocket 객체 생성 실패:', error);
    return null;
  }
};