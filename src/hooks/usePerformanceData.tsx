import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import WebSocketManager, { PerformanceDataType } from '../utils/WebSocketManager';
import { useNodeContext } from '../context/NodeContext';

// 더 강력한 연결 종료 함수 추가
const forceCleanupWebSocket = (wsManager: WebSocketManager | null, type: string, resourceId: string) => {
  if (!wsManager) return;
  
  // 명시적으로 서버에 종료 메시지 전송
  try {
    // WebSocketManager에는 sendMessage 메서드가 없으므로 바로 정리로 진행
    
    // 즉시 연결 종료
    console.log(`[${type}:${resourceId}] 강제 WebSocket 정리 및 연결 종료 요청`);
    
    // 모든 이벤트 핸들러 제거
    wsManager.onSidebarMetrics = null;
    wsManager.onConnectionChange = null;
    wsManager.onError = null;
    
    // 즉시 정리 및 연결 종료
    wsManager.cleanup();
    
    // 100ms 후 한번 더 정리 시도 (안전장치)
    setTimeout(() => {
      try {
        wsManager.cleanup();
      } catch (e) {
        // 무시
      }
    }, 100);
  } catch (err) {
    console.error(`[${type}:${resourceId}] WebSocket 강제 종료 중 오류:`, err);
  }
};

interface DataPoint {
  timestamp: string;
  value: number;
}

interface NetworkInterface {
  interface?: string;
  rx_kbps: number;
  tx_kbps: number;
  ipv4?: string;
  ip?: string;
  model?: string;
  net?: string;
}

interface PerformanceDetails {
  [key: string]: any;
}

export const usePerformanceData = (
  type: PerformanceDataType, 
  resourceId: string = '0',
  enabled: boolean = true
) => {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<PerformanceDetails | null>(null);
  const { selectedNode } = useNodeContext();
  const nodeId = selectedNode?.node_id || '';
  
  // 현재 경로 감지를 위한 훅 추가
  const location = useLocation();
  const prevLocationRef = useRef(location.pathname);
  
  // WebSocket 매니저 인스턴스 참조 저장
  const wsManagerRef = useRef<WebSocketManager | null>(null);
  
  // 모니터링 상태를 확인하기 위한 이전 값 저장
  const prevEnabledRef = useRef<boolean>(enabled);
  
  // 화면 전환 감지 효과 추가
  useEffect(() => {
    // 경로 변경 감지
    if (prevLocationRef.current !== location.pathname) {
      console.log(`[${type}:${resourceId}] 화면 전환 감지: ${prevLocationRef.current} -> ${location.pathname}`);
      
      // 성능 모니터링 페이지가 아니면 WebSocket 연결 종료
      const isPerformancePage = 
        location.pathname.includes('/performance') || 
        location.pathname.includes('/container');
        
      if (!isPerformancePage) {
        console.log(`[${type}:${resourceId}] 성능 페이지 이탈 - 강제 WebSocket 연결 종료`);
        
        try {
          // 싱글톤 인스턴스 가져오기
          const wsManager = WebSocketManager.getInstance();
          
          // 새로 추가된 강력한 정리 함수 호출
          forceCleanupWebSocket(wsManager, type, resourceId);
          
          // 상태 초기화
          setDataPoints([]);
          setIsConnected(false);
          setError(null);
          setDetails(null);
          
          // wsManagerRef 초기화
          wsManagerRef.current = null;
          
          // 서버 연결 상태를 확인하기 위한 추가 로그
          console.log(`[${type}:${resourceId}] WebSocket 연결 상태 최종 확인:`, 
            wsManager.isConnected() ? '여전히 연결됨 (비정상)' : '연결 종료됨 (정상)');
          
        } catch (err) {
          console.error(`[${type}:${resourceId}] 화면 전환 시 WebSocket 정리 중 오류:`, err);
        }
      }
    }
    
    // 컴포넌트 언마운트 시 강제 정리 추가
    return () => {
      // 성능 페이지를 떠날 때 반드시 모든 연결 정리
      if (!location.pathname.includes('/performance') && 
          !location.pathname.includes('/container')) {
        try {
          const wsManager = WebSocketManager.getInstance();
          forceCleanupWebSocket(wsManager, type, resourceId);
        } catch (e) {
          // 무시
        }
      }
      
      prevLocationRef.current = location.pathname;
    };
    
  }, [location.pathname, type, resourceId]);
  
  // WebSocket 연결 및 데이터 처리
  useEffect(() => {
    // 현재 화면이 성능 모니터링 페이지인지 확인
    const isPerformancePage = 
      location.pathname.includes('/performance') || 
      location.pathname.includes('/container');
      
    // 성능 페이지가 아니면 연결하지 않음
    if (!isPerformancePage) {
      console.log(`[${type}:${resourceId}] 성능 모니터링 페이지가 아님: WebSocket 연결 건너뜀`);
      return;
    }
    
    // 모니터링 상태가 활성화 -> 비활성화로 변경된 경우 모든 연결 정리
    if (prevEnabledRef.current && !enabled) {
      console.log(`[${type}:${resourceId}] 모니터링 비활성화 감지: 모든 WebSocket 연결 정리`);
      
      // 싱글톤 인스턴스 가져오기
      try {
        const wsManager = WebSocketManager.getInstance();
        // 기존 핸들러 제거 및 연결 종료
        wsManager.onSidebarMetrics = null;
        wsManager.onConnectionChange = null;
        wsManager.onError = null;
        wsManager.cleanup();
        
        // wsManagerRef 초기화
        wsManagerRef.current = null;
      } catch (err) {
        console.error(`[${type}:${resourceId}] WebSocket 정리 중 오류:`, err);
      }
    }
    
    // 현재 값을 이전 값으로 업데이트
    prevEnabledRef.current = enabled;
    
    if (!enabled) {
      // 데이터 정리
      setDataPoints([]);
      setIsConnected(false);
      setError(null);
      setDetails(null);
      
      // WebSocket 연결 정리
      if (wsManagerRef.current) {
        console.log(`[${type}:${resourceId}] 모니터링 비활성화 상태 - 연결 정리`);
        
        // 핸들러 참조 제거
        if (wsManagerRef.current) {
          wsManagerRef.current.onSidebarMetrics = null;
          wsManagerRef.current.onConnectionChange = null;
          wsManagerRef.current.onError = null;
        }
        
        wsManagerRef.current = null;
      }
      
      return;
    }
    
    console.log(`[${type}:${resourceId}] 모니터링 활성화: WebSocket 연결 시작`);
    
    // WebSocketManager 인스턴스 가져오기
    const wsManager = WebSocketManager.getInstance();
    wsManagerRef.current = wsManager;
    
    // 연결 상태 변경 핸들러
    const handleConnectionChange = (connected: boolean) => {
      console.log(`[${type}:${resourceId}] WebSocket 연결 상태 변경: ${connected}`);
      setIsConnected(connected);
      if (!connected) {
        setError('연결이 끊겼습니다.');
      } else {
        setError(null);
      }
    };
    
    // 메트릭 데이터 수신 핸들러
    const handleSidebarMetrics = (data: any) => {
      if (!data) {
        console.log(`[${type}:${resourceId}] 수신된 데이터 없음`);
        return;
      }
      
      // enabled 상태 확인 - 비활성화 상태면 데이터 처리하지 않음
      if (!enabled) {
        console.log(`[${type}:${resourceId}] 모니터링 비활성화 상태: 데이터 처리 중단`);
        return;
      }
      
      // 현재 성능 페이지가 아니면 데이터 처리하지 않음 (추가)
      if (!location.pathname.includes('/performance') && !location.pathname.includes('/container')) {
        console.log(`[${type}:${resourceId}] 성능 페이지가 아님: 데이터 처리 중단`);
        return;
      }
      
      // 전체 데이터 구조 로깅
      // console.log(`[${type}:${resourceId}] 전체 데이터 구조:`, data);
      
      // 리소스 타입에 따라 해당 데이터 추출
      let resourceData: any = null;
      
      switch (type) {
        case 'cpu':
          if (data.cpu) {
            // console.log(`[${type}:${resourceId}] CPU 데이터:`, data.cpu);
            resourceData = data.cpu;
          } else {
            console.error(`[${type}:${resourceId}] CPU 데이터가 없음`);
          }
          break;
          
        case 'memory':
          if (data.memory) {
            // console.log(`[${type}:${resourceId}] 메모리 데이터:`, data.memory);
            resourceData = data.memory;
          } else {
            console.error(`[${type}:${resourceId}] 메모리 데이터가 없음`);
          }
          break;
          
        case 'disk':
          if (data.disks && Array.isArray(data.disks)) {
            // console.log(`[${type}:${resourceId}] 디스크 데이터:`, data.disks);
            // 여기서 resourceId에 해당하는 디스크만 필터링
            resourceData = data.disks.find((disk: any) => 
              disk.id?.toString() === resourceId
            );
            if (!resourceData) {
              console.error(`[${type}:${resourceId}] ID가 ${resourceId}인 디스크를 찾을 수 없음`);
            }
          } else {
            console.error(`[${type}:${resourceId}] 디스크 데이터가 없음`);
          }
          break;
          
        case 'network':
        case 'ethernet':
          if (data.networks && Array.isArray(data.networks)) {
            // 로그 출력 추가
            // console.log(`[${type}:${resourceId}] 네트워크 데이터:`, data.networks);
            
            // 인터페이스별 트래픽 정보 출력
            data.networks.forEach((net: NetworkInterface, idx: number) => {
              const rx = parseFloat(net.rx_kbps?.toString() || '0');
              const tx = parseFloat(net.tx_kbps?.toString() || '0');
              // console.log(`네트워크 ${idx}: ${net.interface}, 활성? ${rx > 0 || tx > 0}, rx: ${rx}, tx: ${tx}`);
            });
            
            let networkData = null;
            
            // 인덱스로 시도 - resourceId가 숫자인 경우
            const index = parseInt(resourceId, 10);
            if (!isNaN(index) && index >= 0 && index < data.networks.length) {
              networkData = data.networks[index];
              // console.log(`[${type}:${resourceId}] 인덱스로 네트워크 찾음:`, networkData.interface);
              
              // 선택된 인터페이스가 비활성 상태이고, 다른 활성 인터페이스가 있는지 확인
              const rx = parseFloat(networkData.rx_kbps?.toString() || '0');
              const tx = parseFloat(networkData.tx_kbps?.toString() || '0');
              
              if (rx === 0 && tx === 0) {
                // 활성화된 다른 인터페이스 찾기
                const activeInterface = data.networks.find((net: NetworkInterface) => {
                  const netRx = parseFloat(net.rx_kbps?.toString() || '0');
                  const netTx = parseFloat(net.tx_kbps?.toString() || '0');
                  return netRx > 0 || netTx > 0;
                });
                
                if (activeInterface) {
                  // console.log(`[${type}:${resourceId}] 비활성 인터페이스 대신 활성 인터페이스로 전환:`, activeInterface.interface);
                  networkData = activeInterface;
                }
              }
            } else {
              // 이름이나 인터페이스로 시도
              networkData = data.networks.find((net: NetworkInterface) => 
                net.interface === resourceId || 
                net.net === resourceId || 
                (net.interface && net.interface.includes(resourceId))
              );
              
              if (networkData) {
                // console.log(`[${type}:${resourceId}] 이름/인터페이스로 네트워크 찾음:`, networkData.interface);
              } else {
                // 첫 번째 인터페이스 사용
                networkData = data.networks[0];
                // console.log(`[${type}:${resourceId}] 일치하는 네트워크 없음, 첫 번째 사용:`, networkData?.interface);
              }
            }
            
            if (networkData) {
              resourceData = networkData;
            } else {
              console.error(`[${type}:${resourceId}] 적합한 네트워크 인터페이스를 찾을 수 없음`);
            }
          } else {
            console.error(`[${type}:${resourceId}] 네트워크 데이터가 없음`);
          }
          break;
          
        default:
          console.warn(`[${type}:${resourceId}] 지원되지 않는 리소스 유형`);
          break;
      }
      
      if (resourceData) {
        // 메트릭 값 추출
        let value: number = 0;
        
        try {
          // 리소스 타입에 따라 저장할 값 결정
          if (type === 'cpu') {
            value = typeof resourceData.usage === 'string' 
              ? parseFloat(resourceData.usage) 
              : (resourceData.usage || 0);
              
            setDetails({
              speed: resourceData.speed || '',
              cores: resourceData.cores || 1,
              model: resourceData.model || ''
            });
            
            // console.log(`[${type}:${resourceId}] CPU 값 추출:`, value);
          } 
          else if (type === 'memory') {
            value = typeof resourceData.usage_percent === 'string' 
              ? parseFloat(resourceData.usage_percent) 
              : (resourceData.usage_percent || 0);
              
            setDetails({
              used_gb: resourceData.used_gb || 0,
              total_gb: resourceData.total_gb || 0
            });
            
            // console.log(`[${type}:${resourceId}] 메모리 값 추출:`, value);
          }
          else if (type === 'disk') {
            value = typeof resourceData.usage_percent === 'string' 
              ? parseFloat(resourceData.usage_percent) 
              : (resourceData.usage_percent || 0);
              
            setDetails({
              name: resourceData.name || `디스크 ${resourceId}`,
              device: resourceData.device || '',
              type: resourceData.type || 'Unknown'
            });
            
            // console.log(`[${type}:${resourceId}] 디스크 값 추출:`, value);
          }
          else if (type === 'network' || type === 'ethernet' || type === 'wifi') {
            // 이더넷/네트워크의 경우 rx와 tx 합계로 사용하거나 최대값 표시
            const rx = parseFloat(resourceData.rx_kbps?.toString() || '0');
            const tx = parseFloat(resourceData.tx_kbps?.toString() || '0');
            
            // 두 트래픽의 합계를 측정값으로 사용
            value = rx + tx;
            
            setDetails({
              interface_name: resourceData.interface || '',
              name: resourceData.name || 'Network',
              rx: rx.toFixed(1),
              tx: tx.toFixed(1),
              ip: resourceData.ip || resourceData.ipv4 || '',
              model: resourceData.model || ''
            });
            
            // console.log(`[${type}:${resourceId}] 네트워크 값 추출:`, {rx, tx, total: value});
          }
          
          // 데이터 포인트 추가
          setDataPoints(prev => {
            const newData = [...prev, { 
              timestamp: resourceData.timestamp || new Date().toISOString(), 
              value 
            }];
            
            // 최대 20개 데이터 포인트만 유지
            if (newData.length > 20) {
              return newData.slice(newData.length - 20);
            }
            return newData;
          });
          
        } catch (err) {
          console.error(`[${type}:${resourceId}] 데이터 처리 중 오류:`, err);
        }
      }
    };
    
    // 오류 처리 핸들러
    const handleError = (errorMsg: string) => {
      console.error(`[${type}:${resourceId}] WebSocket 오류:`, errorMsg);
      setError(errorMsg);
    };
    
    // 여기서 중요한 변경: 이벤트 핸들러 등록 방식 수정
    // 고유한 ID를 사용하여 핸들러를 등록하여 다른 컴포넌트의 핸들러를 덮어쓰지 않도록 함
    const handlerId = `${type}-${resourceId}`;
    
    // 이전에 등록된 핸들러가 있다면 유지하고, 새 핸들러만 추가
    const prevOnSidebarMetrics = wsManager.onSidebarMetrics;
    
    wsManager.onSidebarMetrics = (data: any) => {
      // 이전 핸들러가 있다면 먼저 호출
      if (prevOnSidebarMetrics && typeof prevOnSidebarMetrics === 'function') {
        try {
          prevOnSidebarMetrics(data);
        } catch (err) {
          console.error('이전 핸들러 실행 오류:', err);
        }
      }
      
      // 새 핸들러 실행
      handleSidebarMetrics(data);
    };
    
    // 연결 상태 변경 핸들러도 유사하게 처리
    const prevOnConnectionChange = wsManager.onConnectionChange;
    
    wsManager.onConnectionChange = (connected: boolean) => {
      // 이전 핸들러가 있다면 먼저 호출
      if (prevOnConnectionChange && typeof prevOnConnectionChange === 'function') {
        try {
          prevOnConnectionChange(connected);
        } catch (err) {
          console.error('이전 연결 핸들러 실행 오류:', err);
        }
      }
      
      // 새 핸들러 실행
      handleConnectionChange(connected);
    };
    
    // 오류 핸들러도 유사하게 처리
    const prevOnError = wsManager.onError;
    
    wsManager.onError = (errorMsg: string) => {
      // 이전 핸들러가 있다면 먼저 호출
      if (prevOnError && typeof prevOnError === 'function') {
        try {
          prevOnError(errorMsg);
        } catch (err) {
          console.error('이전 오류 핸들러 실행 오류:', err);
        }
      }
      
      // 새 핸들러 실행
      handleError(errorMsg);
    };
    
    // 현재 연결 상태 확인
    const currentConnected = wsManager.isConnected();
    setIsConnected(currentConnected);
    console.log(`[${type}:${resourceId}] 현재 WebSocket 연결 상태:`, currentConnected);
    
    // 연결 시작
    wsManager.connect(nodeId);
    console.log(`[${type}:${resourceId}] WebSocket 연결 요청 - 노드 ID:`, nodeId);
    
    // 컴포넌트 언마운트 또는 의존성 변경 시 정리
    return () => {
      console.log(`[${type}:${resourceId}] 컴포넌트 언마운트 또는 의존성 변경 - WebSocket 연결 정리`);
      
      // 컴포넌트가 언마운트될 때 이벤트 핸들러 제거 (다른 핸들러는 유지)
      if (wsManagerRef.current) {
        // 이벤트 핸들러 복원 (이전 핸들러로 되돌림)
        wsManagerRef.current.onSidebarMetrics = prevOnSidebarMetrics;
        wsManagerRef.current.onConnectionChange = prevOnConnectionChange;
        wsManagerRef.current.onError = prevOnError;
        
        // 모니터링 비활성화 시 WebSocket 연결 완전 종료
        if (!enabled) {
          wsManagerRef.current.cleanup();
          wsManagerRef.current = null;
        }
      }
    };
    
  }, [type, resourceId, nodeId, enabled, location.pathname]); // location.pathname 의존성 추가
  
  return { dataPoints, isConnected, error, details };
};