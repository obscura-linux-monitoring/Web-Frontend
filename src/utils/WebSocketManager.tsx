import { getToken } from './Auth';

export type PerformanceDataType = 'cpu' | 'memory' | 'disk' | 'network' | 'wifi' | 'ethernet';

export interface PerformanceDataPoint {
  value: number;
  timestamp: string;
}

export interface SidebarMetricsData {
  cpu?: {
    usage: number;
    cores?: number;
    model?: string;
    speed?: string;
    timestamp: string;
  };
  memory?: {
    usage_percent: number;
    used_gb?: number;
    total_gb?: number;
    timestamp: string;
  };
  disks?: Array<{
    id: number;
    name?: string;
    device?: string;
    model?: string;
    type?: string;
    usage_percent: number;
    read_speed?: number;
    write_speed?: number;
    timestamp: string;
  }>;
}

class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private socket: WebSocket | null = null;
  private nodeId: string = '';
  private connected: boolean = false;
  private reconnectTimer: number | null = null;

  // 콜백 함수들
  public onConnectionChange: ((connected: boolean) => void) | null = null;
  public onSidebarMetrics: ((data: SidebarMetricsData) => void) | null = null;
  public onError: ((error: string) => void) | null = null;

  private constructor() {}

  // 전역 비활성화 상태 추가
  private static monitoringDisabled: boolean = false;

  // 모니터링 전역 활성화/비활성화 메서드 추가
  public static setMonitoringEnabled(enabled: boolean): void {
    console.log(`WebSocketManager: 모니터링 상태를 ${enabled ? '활성화' : '비활성화'}로 변경`);
    
    // 기존 상태와 달라졌을 때만 처리
    if (this.monitoringDisabled !== !enabled) {
      this.monitoringDisabled = !enabled;
      
      // 비활성화로 변경된 경우 인스턴스 정리
      if (this.monitoringDisabled && this.instance) {
        console.log('WebSocketManager: 모니터링 비활성화로 인스턴스 정리 시작');
        this.instance.onConnectionChange = null;
        this.instance.onSidebarMetrics = null;
        this.instance.onError = null;
        this.instance.cleanup();
        
        // 확실한 정리를 위한 인스턴스 재설정
        this.resetInstance();
      }
    }
  }

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  // 싱글톤 인스턴스 초기화 메서드 추가
  public static resetInstance(): void {
    if (WebSocketManager.instance) {
      console.log('WebSocketManager: 모든 인스턴스 정리');
      
      // 기존 인스턴스의 WebSocket 연결 정리
      const instance = WebSocketManager.instance;
      
      // 이벤트 핸들러 제거
      instance.onConnectionChange = null;
      instance.onSidebarMetrics = null;
      instance.onError = null;
      
      // 재연결 타이머 정리
      if (instance.reconnectTimer !== null) {
        clearTimeout(instance.reconnectTimer);
        instance.reconnectTimer = null;
      }
      
      // 소켓 정리
      if (instance.socket !== null) {
        const socket = instance.socket;
        instance.socket = null;
        
        // 이벤트 리스너 제거로 자동 재연결 방지
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.onopen = null;
        
        // 이미 닫혀있지 않은 경우에만 닫기
        if (socket.readyState === WebSocket.OPEN || 
            socket.readyState === WebSocket.CONNECTING) {
          console.log('WebSocketManager: 열린 WebSocket 연결 종료');
          socket.close(1000, 'Client requested disconnection');
        }
      }
      
      // 상태 초기화
      instance.connected = false;
      instance.nodeId = '';
      
      // 인스턴스 참조 제거
      WebSocketManager.instance = null;
    }
  }
  

  public connect(nodeId: string): void {
    // 모니터링이 전역적으로 비활성화되면 연결하지 않음
    if (WebSocketManager.monitoringDisabled) {
      console.log('모니터링이 비활성화 상태 - WebSocket 연결 요청 무시');
      return;
    }
    
    // 이미 같은 노드에 연결되어 있으면 리턴
    if (this.socket && this.nodeId === nodeId && this.socket.readyState === WebSocket.OPEN) {
      return;
    }
    
    this.cleanup();
    this.nodeId = nodeId;
    
    const token = getToken();
    if (!token) {
      console.error("인증 토큰이 없습니다.");
      if (this.onError) this.onError("인증 토큰이 없습니다.");
      return;
    }
    
    const wsUrl = `ws://1.209.148.143:8000/performance/ws/minigraphs/${nodeId}?token=${token}`;
    this.socket = new WebSocket(wsUrl);
    
    this.socket.onopen = () => {
      this.connected = true;
      console.log('사이드바 WebSocket 연결 성공');
      if (this.onConnectionChange) this.onConnectionChange(true);
    };
    
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('수신된 WebSocket 메시지:', data);
        
        // 백엔드가 보내는 메시지 타입 모두 처리
        if ((data.type === 'sidebar_metrics' || data.type === 'minigraphs_metrics') && data.data) {
          console.log('메트릭 데이터 확인:', {
            cpu: data.data.cpu?.usage,
            memory: data.data.memory?.usage_percent,
            disks: data.data.disks?.length,
            networks: data.data.networks?.length
          });
          
          // 데이터 변환이 필요한 경우 여기서 처리
          // 특히 문자열로 오는 숫자를 파싱할 필요가 있을 수 있음
          if (data.data.networks && Array.isArray(data.data.networks)) {
            // Define interfaces for network data
            interface NetworkData {
              rx_kbps: string | number;
              tx_kbps: string | number;
              [key: string]: any; // For other properties
            }

            interface ProcessedNetworkData extends Omit<NetworkData, 'rx_kbps' | 'tx_kbps'> {
              rx_kbps: number;
              tx_kbps: number;
              index: number;
            }

            data.data.networks = data.data.networks.map((net: NetworkData, idx: number): ProcessedNetworkData => {
              return {
                ...net,
                rx_kbps: typeof net.rx_kbps === 'string' ? parseFloat(net.rx_kbps) : net.rx_kbps,
                tx_kbps: typeof net.tx_kbps === 'string' ? parseFloat(net.tx_kbps) : net.tx_kbps,
                index: idx // 인덱스 정보 추가
              };
            });
          }
          
          if (this.onSidebarMetrics) {
            this.onSidebarMetrics(data.data);
          }
        }
        
        // 핑 처리
        if (data.type === 'ping') {
          this.socket?.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        console.error('WebSocket 메시지 처리 오류:', error);
      }
    };
    
    this.socket.onclose = () => {
      this.connected = false;
      
      // 모니터링이 비활성화된 경우 재연결 시도하지 않음
      if (WebSocketManager.monitoringDisabled) {
        console.log('WebSocket 연결 종료: 모니터링이 비활성화되어 재연결하지 않습니다.');
        return;
      }
      
      console.log('WebSocket 연결 종료, 3초 후 재연결 시도');
      
      if (this.onConnectionChange) this.onConnectionChange(false);
      
      // 재연결 시도
      this.reconnectTimer = window.setTimeout(() => {
        this.connect(nodeId);
      }, 3000);
    };
    
    this.socket.onerror = (err) => {
      console.error('WebSocket 오류:', err);
      if (this.onError) this.onError('WebSocket 연결 오류');
    };
  }
  
  public isConnected(): boolean {
    return this.connected;
  }
  
  public cleanup(): void {
    console.log('WebSocketManager: 모든 연결 정리 시작');
    
    // 기존 타이머 정리
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // 소켓 정리
    if (this.socket !== null) {
      // 이벤트 리스너 제거로 자동 재연결 방지
      if (this.socket.readyState === WebSocket.OPEN || 
          this.socket.readyState === WebSocket.CONNECTING) {
        // 소켓 이벤트 핸들러 제거
        this.socket.onclose = null;
        this.socket.onerror = null;
        this.socket.onmessage = null;
        this.socket.onopen = null;
        
        console.log('WebSocket 연결 종료: 모니터링 비활성화');
        this.socket.close();
      }
      this.socket = null;
    }
    
    // 상태 초기화
    this.connected = false;
    this.nodeId = '';
    
    // 이벤트 핸들러가 등록되어 있다면 연결 상태 변경 알림 
    // 하지만 이벤트 핸들러는 제거하지 않음 (개별 컴포넌트에서 제거)
  }

  // 현재 모니터링 상태 확인 메서드
  public static isMonitoringEnabled(): boolean {
    return !this.monitoringDisabled;
  }
}

export default WebSocketManager;