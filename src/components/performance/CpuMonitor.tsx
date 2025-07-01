import { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/CpuMonitor.module.scss';
import '../../scss/performance/performance_mobile/CpuMonitor.module.mobile.scss';
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

interface CpuCoreData {
  id: number;
  usage: number;
  temperature?: number;
}

interface CpuUsagePoint {
  time: number;
  usage: number;
  [key: string]: number; // 코어별 데이터를 위한 동적 키
}

type ViewMode = "overall" | "cores";

interface CpuMonitorProps {
  nodeId?: string;
}

const CpuMonitor = ({ nodeId: propsNodeId }: CpuMonitorProps = {}) => {
  const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();
  const { selectedNode, monitoringEnabled = true } = useNodeContext();
  const { isAuthenticated = true } = useAuth();
  const location = useLocation();
  
  const nodeId = propsNodeId || paramNodeId || selectedNode?.node_id || '';
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>("overall");
  
  // 컴포넌트의 마운트 상태 추적
  const isMounted = useRef(true);
  
  // CPU 데이터 상태
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
  
  // 코어별 데이터 상태
  const [coreData, setCoreData] = useState<CpuCoreData[]>([]);
  
  const [usageHistory, setUsageHistory] = useState<CpuUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60);
  
  const socketRef = useRef<WebSocket | null>(null);
  const timeCounterRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const connectionStatusRef = useRef<string>("연결 준비 중...");

  // 각 코어별 히스토리를 별도로 관리하는 상태 추가
  const [coreUsageHistories, setCoreUsageHistories] = useState<{[key: number]: CpuUsagePoint[]}>({});

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

  // 모든 연결 정리 함수
  const cleanupConnections = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
      socketRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // 서버 연결 함수
  const connectToServer = useCallback(() => {
    cleanupConnections();
    
    if (!isMounted.current) return;

    if (!monitoringEnabled) {
      setConnected(false);
      setLoading(false);
      return;
    }

    try {
      const token = getToken();
      
      if (!token) {
        setError("인증 토큰을 찾을 수 없습니다. 다시 로그인해주세요.");
        setLoading(false);
        return;
      }
      
      // WebSocket URL 구성 - view_mode 파라미터 추가
      const socket = new WebSocket(`ws://1.209.148.143:8000/performance/ws/cpu/${nodeId}?token=${token}&view_mode=${viewMode}`);
      connectionStatusRef.current = "서버에 연결 중...";
      
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
          
          // CPU 코어별 메트릭 처리
          if (response && response.type === 'cpu_core_metrics' && response.data) {
            console.log('🔍 코어별 CPU 데이터 수신:', response.data);
            console.log('🔍 코어별 데이터 키들:', Object.keys(response.data));
            
            const data = response.data;
            
            // 기본 CPU 데이터 업데이트
            setCpuData(prevData => ({ 
              ...prevData,
              usage: data.usage || 0,
              speed: data.speed || prevData.speed,
              model: data.model || prevData.model,
              cores: data.core_count || data.cores || data.total_cores || Array.isArray(data.cores) ? data.cores.length : prevData.cores,
              logicalProcessors: data.logical_processors || data.total_logical_cores || prevData.logicalProcessors,
              l1Cache: data.l1Cache || prevData.l1Cache,
              l2Cache: data.l2Cache || prevData.l2Cache,
              l3Cache: data.l3Cache || prevData.l3Cache,
              processes: data.processes || data.total_processes || 0,
              threads: data.threads || data.total_threads || 0,
              discriptors: data.discriptors || data.total_file_descriptors || 0,
              uptime: data.uptime || (data.uptime_seconds ? formatUptime(data.uptime_seconds) : prevData.uptime),
              baseSpeed: data.baseSpeed || prevData.baseSpeed,
              sockets: data.sockets || prevData.sockets,
              virtualization: data.virtualization || prevData.virtualization,
            }));
            
            // 코어별 데이터 업데이트
            if (data.cores && Array.isArray(data.cores) && data.cores.length > 0) {
              console.log('🔍 코어별 데이터:', data.cores);
              console.log('🔍 코어별 데이터 길이:', data.cores.length);
              
              // 데이터 유효성 검증 및 정제
              const validCores = data.cores
                .filter((core: any) => 
                  core && 
                  typeof core === 'object' && 
                  typeof core.id === 'number' && 
                  typeof core.usage === 'number' &&
                  !isNaN(core.usage) &&
                  core.id >= 0
                )
                .map((core: any) => ({
                  id: Number(core.id),
                  usage: Number(core.usage),
                  temperature: core.temperature || null
                }));
              
              console.log('🔍 검증된 코어 데이터:', validCores);
              
              if (validCores.length > 0) {
                setCoreData(validCores);
                
                // 코어별 사용량 기록 추가
                setUsageHistory(prev => {
                  const newPoint: CpuUsagePoint = {
                    time: timeCounterRef.current++,
                    usage: Number(data.usage) || 0
                  };
                  
                  // 각 코어별 사용률도 추가
                  validCores.forEach((core: any) => {
                    newPoint[`core${core.id}`] = Number(core.usage);
                  });
                  
                  console.log('🔍 차트 데이터 포인트:', newPoint);
                  
                  const newHistory = [...prev, newPoint];
                  if (newHistory.length > maxPoints) {
                    return newHistory.slice(newHistory.length - maxPoints);
                  }
                  return newHistory;
                });
              } else {
                console.warn('⚠️ 유효한 코어 데이터가 없습니다');
              }
            } else {
              console.warn('⚠️ 코어 데이터가 없거나 배열이 아님:', data.cores);
            }
          }
          // 전체 CPU 메트릭 처리 (기존 로직)
          else if (response && response.type === 'cpu_metrics' && response.data) {
            const data = response.data;
            
            setCpuData(prevData => ({ 
              ...prevData,
              usage: data.usage || 0,
              speed: data.speed || prevData.speed,
              model: data.model || prevData.model,
              cores: data.cores || prevData.cores,
              logicalProcessors: data.logical_processors || prevData.logicalProcessors,
              l1Cache: data.l1Cache || prevData.l1Cache,
              l2Cache: data.l2Cache || prevData.l2Cache,
              l3Cache: data.l3Cache || prevData.l3Cache,
              processes: data.processes || data.total_processes || 0,
              threads: data.threads || data.total_threads || 0,
              discriptors: data.discriptors || data.total_file_descriptors || 0,
              uptime: data.uptime || (data.uptime_seconds ? formatUptime(data.uptime_seconds) : prevData.uptime),
              baseSpeed: data.baseSpeed || prevData.baseSpeed,
              sockets: data.sockets || prevData.sockets,
              virtualization: data.virtualization || prevData.virtualization,
            }));
            
            // 전체 사용량 기록 추가
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
        if (!isMounted.current) return;
        
        connectionStatusRef.current = "연결 실패";
        setError('서버 연결 실패. 네트워크를 확인하세요.');
        
        if (monitoringEnabled && isMounted.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted.current) {
              connectionStatusRef.current = "재연결 시도 중...";
              connectToServer();
            }
          }, 5000);
        }
      };
      
      socket.onclose = (event: CloseEvent) => {
        if (!isMounted.current) return;
        
        setConnected(false);
        
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
        
        if (monitoringEnabled && isMounted.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
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
      
      if (monitoringEnabled && isMounted.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted.current) {
            connectionStatusRef.current = "재연결 시도 중...";
            connectToServer();
          }
        }, 5000);
      }
    }
  }, [nodeId, monitoringEnabled, viewMode, cleanupConnections]);

  // 뷰 모드 변경 핸들러
  const handleViewModeChange = (newMode: ViewMode) => {
    setViewMode(newMode);
    // 사용량 이력 초기화
    setUsageHistory([]);
    timeCounterRef.current = 0;
  };

  // 뷰 모드 변경 시 재연결
  useEffect(() => {
    if (monitoringEnabled && connected) {
      connectToServer();
    }
  }, [viewMode]);

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
    
    return () => {
      cleanupConnections();
    };
  }, [nodeId, monitoringEnabled, isAuthenticated, connectToServer, cleanupConnections]);
  
  // 라우트 변경 감지
  useEffect(() => {
    return () => {
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

  // 코어별 사용량 기록 업데이트 함수 수정
  useEffect(() => {
    // 코어별 데이터가 있을 때 각 코어별로 히스토리 관리
    if (Array.isArray(coreData) && coreData.length > 0) {
      setCoreUsageHistories(prev => {
        const newHistories = { ...prev };
        
        coreData.forEach(core => {
          if (!core || typeof core.id !== 'number') return;
          
          const coreId = core.id;
          if (!newHistories[coreId]) {
            newHistories[coreId] = [];
          }
          
          const newPoint = {
            time: timeCounterRef.current,
            usage: Number(core.usage || 0)
          };
          
          const coreHistory = [...newHistories[coreId], newPoint];
          if (coreHistory.length > maxPoints) {
            newHistories[coreId] = coreHistory.slice(coreHistory.length - maxPoints);
          } else {
            newHistories[coreId] = coreHistory;
          }
        });
        
        return newHistories;
      });
    }
  }, [coreData, maxPoints]);

  // 차트 색상 생성 함수
  const generateCoreColors = (count: number) => {
    const colors = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 360 / count) % 360;
      colors.push(`hsl(${hue}, 70%, 50%)`);
    }
    return colors;
  };

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

  // 최적의 그리드 배치 계산 함수 추가
  const calculateOptimalGrid = (coreCount: number) => {
    if (coreCount <= 0) return { rows: 1, cols: 1 };
    
    // 완전제곱수인 경우
    const sqrt = Math.sqrt(coreCount);
    if (Number.isInteger(sqrt)) {
      return { rows: sqrt, cols: sqrt };
    }
    
    // 최적의 행/열 조합 찾기 (정사각형에 가깝게)
    let bestRows = 1;
    let bestCols = coreCount;
    let minDiff = Math.abs(bestCols - bestRows);
    
    for (let rows = 1; rows <= Math.ceil(sqrt); rows++) {
      const cols = Math.ceil(coreCount / rows);
      const diff = Math.abs(cols - rows);
      
      if (diff < minDiff) {
        minDiff = diff;
        bestRows = rows;
        bestCols = cols;
      }
    }
    
    return { rows: bestRows, cols: bestCols };
  };

  // 렌더링
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
        <div className={styles.errorState}>{String(error)}</div>
      ) : !connected ? (
        <div className={styles.disconnectedState}>서버에 연결 중...</div>
      ) : (
        <>
          {/* 연결 상태 표시 */}
          {connected && (
            <div style={connectionStatusStyle}>
              {String(connectionStatusRef.current)}
            </div>
          )}
          
          {/* 뷰 모드 선택 버튼 */}
          <div className={styles.viewModeSelector}>
            <button 
              className={`${styles.viewModeButton} ${viewMode === 'overall' ? styles.active : ''}`}
              onClick={() => handleViewModeChange('overall')}
            >
              전체 이용률
            </button>
            <button 
              className={`${styles.viewModeButton} ${viewMode === 'cores' ? styles.active : ''}`}
              onClick={() => handleViewModeChange('cores')}
              disabled={!cpuData.logicalProcessors || cpuData.logicalProcessors === 0}
            >
              논리 프로세서별 ({cpuData.logicalProcessors || 0}개)
            </button>
          </div>
          
          <div className={styles.usageSection} style={!monitoringEnabled ? disabledStyle : {}}>
            {viewMode === 'overall' ? (
              // 전체 CPU 사용률 차트 (기존 방식)
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
                      formatter={(value) => [`${Number(value || 0).toFixed(1)}%`, '이용률']}
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
              </div>
            ) : (
              // 코어별 개별 그래프들 (작업관리자 스타일)
              <div className={styles.coresChartContainer}>
                <div className={styles.coresHeader}>
                  <div className={styles.coresTitle}>
                    {cpuData.model || 'CPU'} {cpuData.logicalProcessors ? `${cpuData.logicalProcessors}-Core Processor` : ''}
                  </div>
                  <div className={styles.coresTimeLabel}>60초 간 이용률(%)</div>
                  <div className={styles.coresMaxUsage}>100%</div>
                </div>
                
                <div 
                  className={styles.coresGrid}
                  style={{
                    gridTemplateColumns: `repeat(${calculateOptimalGrid(coreData.length).cols}, 1fr)`,
                    gridTemplateRows: `repeat(${calculateOptimalGrid(coreData.length).rows}, 1fr)`
                  }}
                >
                  {Array.isArray(coreData) && coreData.length > 0 && coreData.map((core, index) => {
                    if (!core || typeof core.id !== 'number') return null;
                    
                    const coreId = core.id;
                    const coreHistory = coreUsageHistories[coreId] || [];
                    const currentUsage = Number(core.usage || 0);
                    
                    return (
                      <div key={`core-chart-${coreId}`} className={styles.coreChartItem}>
                        <div className={styles.coreChartHeader}>
                          CPU {coreId}
                        </div>
                        <div className={styles.coreChartWrapper}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={coreHistory}
                              margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
                            >
                              <defs>
                                <linearGradient id={`colorCore${coreId}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#00BFFF" stopOpacity={0.8}/>
                                  <stop offset="95%" stopColor="#00BFFF" stopOpacity={0.3}/>
                                </linearGradient>
                              </defs>
                              <YAxis domain={[0, 100]} hide />
                              <XAxis dataKey="time" hide />
                              <Area 
                                type="monotone" 
                                dataKey="usage" 
                                stroke="#00BFFF" 
                                strokeWidth={1}
                                fill={`url(#colorCore${coreId})`}
                                isAnimationActive={false}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                        <div className={styles.coreUsageLabel}>
                          {currentUsage.toFixed(0)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          
          <div className={styles.detailsSection} style={!monitoringEnabled ? disabledStyle : {}}>
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>이용률</span>
                <span className={styles.detailValue}>{Number(cpuData.usage || 0).toFixed(1)}%</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>속도</span>
                <span className={styles.detailValue}>{String(cpuData.speed || '-')}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>프로세스</span>
                <span className={styles.detailValue}>{Number(cpuData.processes || 0)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>스레드</span>
                <span className={styles.detailValue}>{Number(cpuData.threads || 0)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>디스크립터</span>
                <span className={styles.detailValue}>{Number(cpuData.discriptors || 0)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>작동 시간</span>
                <span className={styles.detailValue}>{String(cpuData.uptime || '-')}</span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>기본 속도:</span>
                <span className={styles.detailValue}>{String(cpuData.baseSpeed || '-')}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>소켓:</span>
                <span className={styles.detailValue}>{Number(cpuData.sockets || 0)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>코어:</span>
                <span className={styles.detailValue}>{Number(cpuData.cores || 0)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>논리 프로세서:</span>
                <span className={styles.detailValue}>{Number(cpuData.logicalProcessors || 0)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>가상화:</span>
                <span className={styles.detailValue}>{String(cpuData.virtualization || '-')}</span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>L1 캐시:</span>
                <span className={styles.detailValue}>{String(cpuData.l1Cache || '-')}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>L2 캐시:</span>
                <span className={styles.detailValue}>{String(cpuData.l2Cache || '-')}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>L3 캐시:</span>
                <span className={styles.detailValue}>{String(cpuData.l3Cache || '-')}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CpuMonitor;