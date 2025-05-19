import { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/MemoryMonitor.module.scss';
import { useLocation, useParams } from 'react-router-dom';
import { useNodeContext } from '../../context/NodeContext';
import { useAuth } from '../../hooks/useAuth';
import { getToken } from '../../utils/Auth';

interface MemoryData {
  usagePercent: number;
  used: number;
  available: number;
  total: number;
  speed?: string;
  
  // 기존 필드
  slots?: number;
  formFactor?: string;
  hardwareReserved?: number;
  committed?: number;
  cached?: number;
  pagingFile?: number;
  compressed?: number;
  
  // 새로 추가된 필드
  dataRate?: number;
  nonPagedPoolSize?: number;
  pagedPoolSize?: number;
  totalSlotCount?: number;
  usingSlotCount?: number;
  buffers?: number;
  swapFree?: number;
  swapTotal?: number;
  swapUsed?: number;
  swapPercent?: number;
}

interface MemoryUsagePoint {
  time: number;
  usage: number;
}

interface MemoryMonitorProps {
  nodeId?: string;
}

const MemoryMonitor = ({ nodeId: propsNodeId }: MemoryMonitorProps = {}) => {
  // 기존 코드는 유지
  const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();
  const { selectedNode, monitoringEnabled = true } = useNodeContext();
  const { isAuthenticated = true } = useAuth();
  const location = useLocation();
  
  const nodeId = propsNodeId || paramNodeId || selectedNode?.node_id || '';
  const isMounted = useRef(true);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  
  // 초기 값은 모든 필드에 기본값 설정
  const [memoryData, setMemoryData] = useState<MemoryData>({ 
    usagePercent: 0,
    used: 0,
    available: 0,
    total: 0,
    speed: "-",
    slots: 0,
    formFactor: "-",
    hardwareReserved: 0,
    committed: 0,
    cached: 0,
    pagingFile: 0,
    compressed: 0,
    dataRate: 0,
    nonPagedPoolSize: 0,
    pagedPoolSize: 0,
    totalSlotCount: 0,
    usingSlotCount: 0,
    buffers: 0,
    swapFree: 0,
    swapTotal: 0,
    swapUsed: 0,
    swapPercent: 0
  });
  
  const [usageHistory, setUsageHistory] = useState<MemoryUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60);
  
  const socketRef = useRef<WebSocket | null>(null);
  const timeCounterRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const connectionStatusRef = useRef<string>("연결 준비 중...");

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
      const socket = new WebSocket(`ws://1.209.148.143:8000/performance/ws/memory/${nodeId}?token=${token}`);
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
          if (response && response.type === 'memory_metrics' && response.data) {
            const data = response.data;
            
            // 메모리 데이터 업데이트
            setMemoryData(prevData => ({
              ...prevData,
              usagePercent: data.usage_percent || 0,
              used: data.used || 0,
              available: data.available || 0,
              total: data.total || 0,
              speed: data.speed || prevData.speed,
              
              // 기존 필드 매핑
              slots: data.total_slot_count || prevData.slots,
              formFactor: data.form_factor || prevData.formFactor,
              hardwareReserved: data.hardware_reserved || prevData.hardwareReserved,
              committed: data.committed || prevData.committed,
              cached: data.cached || prevData.cached,
              pagingFile: data.paging_file || prevData.pagingFile,
              compressed: data.compressed || prevData.compressed,
              
              // 새로 추가된 필드 매핑
              dataRate: data.data_rate || 0,
              nonPagedPoolSize: data.non_paged_pool || 0,
              pagedPoolSize: data.paged_pool || 0,
              totalSlotCount: data.total_slot_count || 0,
              usingSlotCount: data.using_slot_count || 0,
              buffers: data.buffers || 0,
              swapFree: data.swap_free || 0,
              swapTotal: data.swap_total || 0,
              swapUsed: data.swap_used || 0,
              swapPercent: data.swap_percent || 0
            }));
            
            // 사용량 기록 추가
            setUsageHistory(prev => {
              const newPoint = {
                time: timeCounterRef.current++,
                usage: data.usage_percent || 0
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

  // 이하 useEffect 코드는 동일하게 유지
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (monitoringEnabled) {
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

      connectToServer();
    } else {
      cleanupConnections();
      setConnected(false);
      setLoading(false);
    }
    
    return () => { cleanupConnections(); };
  }, [nodeId, monitoringEnabled, isAuthenticated, connectToServer, cleanupConnections]);
  
  useEffect(() => {
    return () => { cleanupConnections(); };
  }, [location, cleanupConnections]);
  
  useEffect(() => {
    const handleBeforeUnload = () => { cleanupConnections(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); };
  }, [cleanupConnections]);

  // 스타일 정의 유지
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

  const disabledStyle = {
    opacity: 0.5,
    pointerEvents: 'none' as 'none',
    filter: 'grayscale(100%)'
  };

  // 이미지에 표시된 값을 계산하기 위한 함수들
  const formatMemorySize = (sizeInGB: number) => {
    if (sizeInGB >= 1) {
      return `${sizeInGB.toFixed(1)}GB`;
    } else {
      return `${Math.round(sizeInGB * 1024)}MB`;
    }
  };

  // 사용 중인 메모리 표시 (7.0GB (348MB) 형식)
  const usedMemoryFormatted = () => {
    const mainGB = Math.floor(memoryData.used);
    const remainingMB = Math.round((memoryData.used - mainGB) * 1024);
    return `${mainGB.toFixed(1)}GB (${remainingMB}MB)`;
  };

  // 커밋된 메모리 표시 (16.1/27.3GB 형식)
  const committedMemoryFormatted = () => {
    const used = memoryData.committed || 0;
    const total = (memoryData.total || 0) + (memoryData.swapTotal || 0) / 1024;
    return `${used.toFixed(1)}/${total.toFixed(1)}GB`;
  };

  // 렌더링 부분 - 이미지에 맞게 수정
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
                    <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00B294" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#00B294" stopOpacity={0.2}/>
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
                    stroke="#00B294" 
                    fillOpacity={1} 
                    fill="url(#colorMemory)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className={styles.chartLabel}>메모리 사용량</div>
            </div>
          </div>
          
          <div className={styles.detailsSection} style={!monitoringEnabled ? disabledStyle : {}}>
            <div className={styles.detailColumn}>
              {/* 이미지에 맞게 수정된 메모리 사용량 정보 */}
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>사용 중(합계):</span>
                <span className={styles.detailValue}>{usedMemoryFormatted()}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>사용 가능:</span>
                <span className={styles.detailValue}>
                  {Math.round(memoryData.available * 1024)}MB
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>속도:</span>
                <span className={styles.detailValue}>
                  {memoryData.dataRate ? `${memoryData.dataRate} MT/s` : '-'}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>사용된 슬롯:</span>
                <span className={styles.detailValue}>
                  {memoryData.usingSlotCount}/{memoryData.totalSlotCount || 0}
                </span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              {/* 이미지에 맞게 수정된 두 번째 열 */}
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>폼 팩터:</span>
                <span className={styles.detailValue}>{memoryData.formFactor || '칩 형'}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>커밋됨:</span>
                <span className={styles.detailValue}>{committedMemoryFormatted()}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>캐시됨:</span>
                <span className={styles.detailValue}>
                  {Math.round((memoryData.cached ?? 0) * 1024)}MB
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>하드웨어 예약:</span>
                <span className={styles.detailValue}>
                  {Math.round((memoryData.hardwareReserved ?? 0) * 1024)}MB
                </span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              {/* 이미지에 맞게 수정된 세 번째 열 */}
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>페이징 풀:</span>
                <span className={styles.detailValue}>
                  {Math.round((memoryData.pagedPoolSize ?? 0))}MB
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>비페이징 풀:</span>
                <span className={styles.detailValue}>
                  {Math.round((memoryData.nonPagedPoolSize ?? 0))}MB
                </span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              {/* 스왑 메모리 정보와 추가 정보 */}
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>스왑 사용률:</span>
                <span className={styles.detailValue}>
                  {memoryData.swapPercent ? `${memoryData.swapPercent.toFixed(1)}%` : '0%'}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>스왑 사용:</span>
                <span className={styles.detailValue}>
                  {Math.round((memoryData.swapUsed ?? 0) * 1024)}MB
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>스왑 총량:</span>
                <span className={styles.detailValue}>
                  {Math.round((memoryData.swapTotal ?? 0) * 1024)}MB
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>버퍼:</span>
                <span className={styles.detailValue}>
                  {Math.round((memoryData.buffers ?? 0) * 1024)}MB
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MemoryMonitor;