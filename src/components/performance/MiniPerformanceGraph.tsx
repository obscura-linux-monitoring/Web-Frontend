import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';

interface MiniGraphProps {
  type: 'cpu' | 'memory' | 'disk' | 'network' | 'wifi' | 'ethernet';
  resourceId?: string; // 디스크 ID 등을 위한 식별자
  color: string;
}

// 그래프 데이터 포인트 인터페이스
interface DataPoint {
  value: number;
  timestamp: string;
}

const MiniPerformanceGraph: React.FC<MiniGraphProps> = ({ type, resourceId = '0', color }) => {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  
  // Refs for connection management
  const socketRef = useRef<WebSocket | null>(null);
  const isMounted = useRef<boolean>(true);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const connectionStatusRef = useRef<string>("연결 준비 중...");
  const maxPoints = 30; // 최대 30개 데이터 포인트만 유지
  
  // 모든 연결 정리 함수를 useCallback으로 감싸 안정적으로 참조
  const cleanupConnections = useCallback(() => {
    // WebSocket 정리
    if (socketRef.current) {
      socketRef.current.onclose = null; // 중요: onclose 핸들러 제거하여 재연결 시도 방지
      socketRef.current.close();
      socketRef.current = null;
    }
    
    // 재연결 타이머 정리
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // 서버 연결 함수
  const connectToServer = useCallback(() => {
    // 이전 연결 정리
    cleanupConnections();
    
    // 이미 언마운트된 경우 연결 시도 중단
    if (!isMounted.current) return;

    try {
      const nodeId = window.location.pathname.split('/').pop() || '';
      const token = localStorage.getItem('token');
      
      // 토큰 또는 노드ID가 없으면 오류 표시
      if (!token || !nodeId) {
        setError("인증 정보가 없습니다.");
        return;
      }
      
      // WebSocket 연결 설정 (실제 서버 주소 사용)
      const wsUrl = `ws://1.209.148.143:8000/performance/ws/sidebar/${nodeId}?token=${token}`;
      const socket = new WebSocket(wsUrl);
      connectionStatusRef.current = "서버에 연결 중...";
      
      socket.onopen = () => {
        if (!isMounted.current) {
          socket.close();
          return;
        }
        connectionStatusRef.current = "서버 연결됨";
        setConnected(true);
        setError(null);
        console.log('사이드바 미니그래프 WebSocket 연결됨');
      };
      
      socket.onmessage = (event) => {
        if (!isMounted.current) return;
        
        try {
          const data = JSON.parse(event.data);
          
          // 핑/퐁 처리
          if (data.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          
          // 오류 메시지 처리
          if (data.type === 'error') {
            setError(data.message || '서버에서 오류가 발생했습니다.');
            return;
          }
          
          // 사이드바 메트릭 데이터 처리
          if (data.type === 'sidebar_metrics') {
            let newValue = 0;
            
            // 리소스 타입에 따라 적절한 값 추출
            if (type === 'cpu') {
              newValue = data.data.cpu.usage;
            } else if (type === 'memory') {
              newValue = data.data.memory.usage_percent;
            } else if (type === 'disk') {
              // 디스크는 resourceId로 해당 디스크 찾기
              const diskIndex = parseInt(resourceId);
              const diskData = data.data.disks[diskIndex];
              if (diskData) {
                newValue = diskData.usage_percent;
              }
            } else if (type === 'network') {
              // 네트워크 데이터가 있다면 처리
              newValue = data.data.network?.usage_percent || 0;
            } else if (type === 'wifi') {
              // 네트워크 데이터가 있다면 처리
              newValue = data.data.wifi?.usage_percent || 0;
            } else if (type === 'ethernet') {
              // 네트워크 데이터가 있다면 처리
              newValue = data.data.ethernet?.usage_percent || 0;
            }
            
            // 새 데이터 포인트 추가
            setDataPoints(prev => {
              const newPoints = [...prev, { 
                value: newValue, 
                timestamp: data.timestamp 
              }];
              
              // 최대 포인트 수 유지
              if (newPoints.length > maxPoints) {
                return newPoints.slice(newPoints.length - maxPoints);
              }
              return newPoints;
            });
          }
        } catch (error) {
          if (isMounted.current) {
            console.error('미니그래프 데이터 처리 오류:', error);
          }
        }
      };
      
      socket.onclose = (event) => {
        if (!isMounted.current) return;
        
        connectionStatusRef.current = "연결 끊김";
        setConnected(false);
        console.log('미니그래프 WebSocket 연결 종료');
        
        // 정상 종료가 아닌 경우에만 재연결 시도
        if (!event.wasClean) {
          console.log("🔄 미니그래프 WebSocket 연결 끊김. 재연결 시도 중...");
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted.current) {
              connectToServer();
            }
          }, 3000);
        }
      };
      
      socket.onerror = (error) => {
        if (!isMounted.current) return;
        console.error("❌ 미니그래프 WebSocket 오류:", error);
        connectionStatusRef.current = "연결 오류";
        setError('서버 연결 오류가 발생했습니다.');
      };
      
      socketRef.current = socket;
    } catch (error) {
      if (!isMounted.current) return;
      
      setError('WebSocket 연결을 생성할 수 없습니다.');
      connectionStatusRef.current = "연결 실패";
      
      // 재연결 시도
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
          connectionStatusRef.current = "재연결 시도 중...";
          connectToServer();
        }
      }, 5000);
    }
  }, [cleanupConnections, resourceId, type]);

  // 컴포넌트 마운트/언마운트 관리
  useEffect(() => {
    isMounted.current = true;
    connectToServer();
    
    return () => { 
      isMounted.current = false;
      cleanupConnections(); 
    };
  }, [connectToServer, cleanupConnections]);

  // 페이지 이탈 시 연결 정리
  useEffect(() => {
    const handleBeforeUnload = () => { 
      cleanupConnections(); 
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => { 
      window.removeEventListener('beforeunload', handleBeforeUnload); 
    };
  }, [cleanupConnections]);

  // 그래프 데이터 구성
  const chartData = {
    labels: dataPoints.map(p => ''), // 빈 라벨 사용 (공간 절약)
    datasets: [
      {
        data: dataPoints.map(p => p.value),
        borderColor: color,
        backgroundColor: `${color}33`, // 색상에 투명도 추가
        fill: true,
        tension: 0.4, // 곡선 부드러움
        pointRadius: 0, // 점 표시 안함
      },
    ],
  };

  // 그래프 옵션
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: { 
        display: false,
        min: 0, 
        max: type === 'network' ? undefined : 100, // 네트워크 제외 0-100% 고정
      },
    },
    animation: { duration: 0 }, // 애니메이션 비활성화로 성능 향상
  };

  // 에러 또는 로딩 상태 표시
  if (error) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'rgba(255,0,0,0.1)'
      }}>
        <span style={{ fontSize: '10px', color: '#ff5555' }}>오류</span>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {dataPoints.length > 0 ? (
        <Line data={chartData} options={chartOptions} />
      ) : (
        <div style={{ 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: connected ? 'rgba(0,0,0,0.1)' : 'rgba(100,100,100,0.1)'
        }}>
          <span style={{ fontSize: '10px', color: '#666' }}>
            {connected ? '대기 중...' : '연결 중...'}
          </span>
        </div>
      )}
    </div>
  );
};

export default MiniPerformanceGraph;