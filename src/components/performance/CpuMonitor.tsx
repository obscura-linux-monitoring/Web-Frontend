import { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/CpuMonitor.module.scss';
import { useParams, useLocation } from 'react-router-dom';
import { useNodeContext } from '../../context/NodeContext';
import { useAuth } from '../../hooks/useAuth';
import { getToken } from '../../utils/Auth';

interface CpuData {
  usage: number;
  speed?: string;
  model?: string;
  baseSpeed?: string;
  sockets?: number;
  cores?: number;
  logicalProcessors?: number;
  virtualization?: string;
  l1Cache?: string;
  l2Cache?: string;
  l3Cache?: string;
  processes?: number;
  threads?: number;
  discriptors?: number;
  uptime?: string;
}

interface CpuUsagePoint {
  time: number;
  usage: number;
}

interface CpuMonitorProps {
  nodeId?: string;
}

const CpuMonitor = ({ nodeId: propsNodeId }: CpuMonitorProps = {}) => {
  const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();
  const { selectedNode, monitoringEnabled = true } = useNodeContext();
  const { isAuthenticated = true } = useAuth();
  const location = useLocation(); // 라우트 변경 감지
  
  const nodeId = propsNodeId || paramNodeId || selectedNode?.node_id || '';
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  
  // 컴포넌트의 마운트 상태 추적
  const isMounted = useRef(true);
  
  // 초기 값은 모든 필드에 기본값 설정
  const [cpuData, setCpuData] = useState<CpuData>({ 
    usage: 0,
    speed: "-",
    model: "-",
    baseSpeed: "-",
    sockets: 0,
    cores: 0,
    logicalProcessors: 0,
    virtualization: "-",
    l1Cache: "-",
    l2Cache: "-", 
    l3Cache: "-",
    processes: 0,
    threads: 0,
    discriptors: 0,
    uptime: "-"
  });
  
  const [usageHistory, setUsageHistory] = useState<CpuUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60);
  
  const socketRef = useRef<WebSocket | null>(null);
  const timeCounterRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const connectionStatusRef = useRef<string>("연결 준비 중...");

  // 초 단위를 시:분:초 형식으로 변환하는 함수
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return days > 0 
      ? `${days}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

    // 모니터링이 비활성화되었으면 여기서 종료
    if (!monitoringEnabled) {
      setConnected(false);
      setLoading(false);
      return;
    }

    try {
      const token = getToken();
      
      // 토큰이 없으면 오류 표시
      if (!token) {
        setError("인증 토큰을 찾을 수 없습니다. 다시 로그인해주세요.");
        setLoading(false);
        return;
      }
      
      // WebSocket URL 구성
      const socket = new WebSocket(`ws://1.209.148.143:8000/performance/ws/cpu/${nodeId}?token=${token}`);
      connectionStatusRef.current = "서버에 연결 중...";
      
      // 이벤트 핸들러 설정
      socket.onopen = () => {
        if (!isMounted.current) {
          socket.close();
          return;
        }
        connectionStatusRef.current = "서버 연결됨";
        setConnected(true);
        setError(null);
      };
      
      socket.onmessage = (event: MessageEvent) => {
        // 컴포넌트가 언마운트되었거나 모니터링이 비활성화되었으면 메시지 처리하지 않음
        if (!isMounted.current || !monitoringEnabled) return;
        
        try {
          const response = JSON.parse(event.data);
          
          // 핑 메시지 처리
          if (response.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          
          // 오류 메시지 처리
          if (response.type === 'error') {
            setError(response.message || '서버에서 오류가 발생했습니다.');
            return;
          }
          
          // 서버의 응답 구조에 맞게 처리
          if (response && response.type === 'cpu_metrics' && response.data) {
            const data = response.data;
            
            // CPU 데이터 업데이트 (이제 discriptors 필드로 유지)
            setCpuData(prevData => ({ 
              ...prevData,
              // 필수 CPU 정보
              usage: data.usage || 0,
              speed: data.speed || prevData.speed,
              model: data.model || prevData.model,
              cores: data.cores || prevData.cores,
              logicalProcessors: data.logical_processors || prevData.logicalProcessors,
              
              // 캐시 정보
              l1Cache: data.l1Cache || prevData.l1Cache,
              l2Cache: data.l2Cache || prevData.l2Cache,
              l3Cache: data.l3Cache || prevData.l3Cache,
              
              // 시스템 정보 - 필드명 유지
              processes: data.processes || data.total_processes || 0,
              threads: data.threads || data.total_threads || 0,
              discriptors: data.discriptors || data.total_file_descriptors || 0,
              
              // 작동 시간
              uptime: data.uptime || (data.uptime_seconds ? formatUptime(data.uptime_seconds) : prevData.uptime),
              
              // 추가 CPU 정보
              baseSpeed: data.baseSpeed || prevData.baseSpeed,
              sockets: data.sockets || prevData.sockets,
              virtualization: data.virtualization || prevData.virtualization,
            }));
            
            // 사용량 기록 추가
            setUsageHistory(prev => {
              const newPoint = {
                time: timeCounterRef.current++,
                usage: data.usage || 0
              };
              
              const newHistory = [...prev, newPoint];
              if (newHistory.length > maxPoints) {
                return newHistory.slice(newHistory.length - maxPoints);
              }
              return newHistory;
            });
          }
          
          setLoading(false);
        } catch (err) {
          if (isMounted.current) {
            console.error('❌ WebSocket 메시지 파싱 실패:', err);
            setError('데이터 파싱 오류');
          }
        }
      };
      
      socket.onerror = (err: Event) => {
        // 컴포넌트가 언마운트되었으면 처리 중단
        if (!isMounted.current) return;
        
        connectionStatusRef.current = "연결 실패";
        setError('서버 연결 실패. 네트워크를 확인하세요.');
        
        // 모니터링이 활성화된 경우에만 재연결 시도
        if (monitoringEnabled && isMounted.current) {
          // 5초 후 재연결 시도
          reconnectTimeoutRef.current = setTimeout(() => {
            // 컴포넌트가 여전히 마운트 상태인지 확인
            if (isMounted.current) {
              connectionStatusRef.current = "재연결 시도 중...";
              connectToServer();
            }
          }, 5000);
        }
      };
      
      socket.onclose = (event: CloseEvent) => {
        // 컴포넌트가 언마운트되었으면 처리 중단
        if (!isMounted.current) return;
        
        setConnected(false);
        
        // 코드에 따른 오류 메시지
        if (event.code === 1008) {
          setError('인증에 실패했습니다. 토큰이 만료되었거나 유효하지 않습니다.');
          connectionStatusRef.current = "인증 실패";
        } else if (event.code === 1006) {
          setError('비정상적으로 연결이 종료되었습니다. 네트워크 연결을 확인하세요.');
          connectionStatusRef.current = "연결 종료";
        } else if (!event.wasClean) {
          setError('비정상적으로 연결이 종료되었습니다.');
          connectionStatusRef.current = "비정상 종료";
        } else {
          connectionStatusRef.current = "연결 종료됨";
        }
        
        // 모니터링이 활성화된 경우에만 재연결 시도
        if (monitoringEnabled && isMounted.current) {
          // 5초 후 재연결 시도
          reconnectTimeoutRef.current = setTimeout(() => {
            // 컴포넌트가 여전히 마운트 상태인지 확인
            if (isMounted.current) {
              connectionStatusRef.current = "재연결 시도 중...";
              connectToServer();
            }
          }, 5000);
        }
      };
      
      socketRef.current = socket;
      
    } catch (error) {
      if (!isMounted.current) return;
      
      setError('WebSocket 연결을 생성할 수 없습니다.');
      connectionStatusRef.current = "연결 실패";
      
      // 모니터링이 활성화된 경우에만 재연결 시도
      if (monitoringEnabled && isMounted.current) {
        // 5초 후 재연결 시도
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted.current) {
            connectionStatusRef.current = "재연결 시도 중...";
            connectToServer();
          }
        }, 5000);
      }
    }
  }, [nodeId, monitoringEnabled, cleanupConnections]);

  // 컴포넌트 마운트/언마운트 상태 추적
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // 모니터링 상태 변경 시 연결 관리
  useEffect(() => {
    if (monitoringEnabled) {
      // 기본 검증 로직
      if (!nodeId) {
        setError("유효한 노드 ID가 필요합니다.");
        setLoading(false);
        return;
      }

      if (!isAuthenticated) {
        setError("인증이 필요합니다.");
        setLoading(false);
        return;
      }

      // 서버 연결 시도
      connectToServer();
    } else {
      // 모니터링 비활성화 시 모든 연결 정리
      cleanupConnections();
      setConnected(false);
      setLoading(false);
    }
    
    return () => {
      // 정리 작업
      cleanupConnections();
    };
  }, [nodeId, monitoringEnabled, isAuthenticated, connectToServer, cleanupConnections]);
  
  // 라우트 변경 감지 - 추가된 부분
  useEffect(() => {
    return () => {
      // 라우트가 변경될 때마다 연결 정리
      cleanupConnections();
    };
  }, [location, cleanupConnections]);
  
  // 페이지 떠날 때 정리
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupConnections();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [cleanupConnections]);

  // 연결 상태 표시 스타일
  const connectionStatusStyle = {
    position: 'absolute' as 'absolute',
    top: '10px',
    right: '10px',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 'bold',
    backgroundColor: connected ? 'rgba(0, 128, 0, 0.8)' : 'rgba(255, 59, 48, 0.8)',
    color: 'white',
    zIndex: 10
  };

  // 모니터링 비활성화 스타일
  const disabledStyle = {
    opacity: 0.5,
    pointerEvents: 'none' as 'none',
    filter: 'grayscale(100%)'
  };

  // 렌더링 부분 (디스크립터 필드명 유지)
  return (
    <div className={styles.mainPanel}>
      {!monitoringEnabled ? (
        <div className={styles.disconnectedState}>
          <div style={{ fontSize: '16px', marginBottom: '10px' }}>모니터링이 비활성화되었습니다</div>
          <div style={{ fontSize: '13px', opacity: 0.7 }}>데이터 수집을 시작하려면 모니터링을 활성화하세요</div>
        </div>
      ) : loading && !error ? (
        <div className={styles.loadingState}>데이터 로딩 중...</div>
      ) : error ? (
        <div className={styles.errorState}>{error}</div>
      ) : !connected ? (
        <div className={styles.disconnectedState}>서버에 연결 중...</div>
      ) : (
        <>
          {/* 연결 상태 표시 */}
          {connected && (
            <div style={connectionStatusStyle}>
              {connectionStatusRef.current}
            </div>
          )}
          
          <div className={styles.usageSection} style={!monitoringEnabled ? disabledStyle : {}}>
            <div className={styles.usageHeader}>
              <span>% 이용률</span>
              <span className={styles.maxUsage}>100%</span>
            </div>
            
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={usageHistory}
                  margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0078D4" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#0078D4" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                  <XAxis 
                    dataKey="time" 
                    tick={false}
                    axisLine={false}
                    label={{ value: '60초', position: 'insideBottomLeft', offset: -5, fill: '#888' }}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    axisLine={false}
                    tick={false}
                  />
                  <Tooltip 
                    formatter={(value) => [`${value}%`, '이용률']}
                    contentStyle={{ backgroundColor: '#333', border: 'none', borderRadius: '4px' }}
                    labelFormatter={() => ''}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="usage" 
                    stroke="#0078D4" 
                    fillOpacity={1} 
                    fill="url(#colorUsage)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className={styles.chartLabel}>CPU 작업</div>
            </div>
          </div>
          
          <div className={styles.detailsSection} style={!monitoringEnabled ? disabledStyle : {}}>
            <div className={styles.detailColumn}>
              {/* 항상 모든 항목 표시 - 첫번째 컬럼 */}
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>이용률</span>
                <span className={styles.detailValue}>{cpuData.usage?.toFixed(1) || 0}%</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>속도</span>
                <span className={styles.detailValue}>{cpuData.speed || '-'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>프로세스</span>
                <span className={styles.detailValue}>{cpuData.processes || 0}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>스레드</span>
                <span className={styles.detailValue}>{cpuData.threads || 0}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>디스크립터</span>
                <span className={styles.detailValue}>{cpuData.discriptors || 0}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>작동 시간</span>
                <span className={styles.detailValue}>{cpuData.uptime || '-'}</span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              {/* 항상 모든 항목 표시 - 두번째 컬럼 */}
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>기본 속도:</span>
                <span className={styles.detailValue}>{cpuData.baseSpeed || '-'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>소켓:</span>
                <span className={styles.detailValue}>{cpuData.sockets || 0}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>코어:</span>
                <span className={styles.detailValue}>{cpuData.cores || 0}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>논리 프로세서:</span>
                <span className={styles.detailValue}>{cpuData.logicalProcessors || 0}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>가상화:</span>
                <span className={styles.detailValue}>{cpuData.virtualization || '-'}</span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              {/* 항상 모든 항목 표시 - 세번째 컬럼 */}
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>L1 캐시:</span>
                <span className={styles.detailValue}>{cpuData.l1Cache || '-'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>L2 캐시:</span>
                <span className={styles.detailValue}>{cpuData.l2Cache || '-'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>L3 캐시:</span>
                <span className={styles.detailValue}>{cpuData.l3Cache || '-'}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CpuMonitor;