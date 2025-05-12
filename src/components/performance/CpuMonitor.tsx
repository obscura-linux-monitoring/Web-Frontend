import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/PerformanceView.module.scss';
import { useParams } from 'react-router-dom';
import { useNodeContext } from '../../context/NodeContext';

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
  handles?: number;
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
  // URL 파라미터에서 nodeId 가져오기
  const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();

  // NodeContext에서 선택된 노드 정보와 모니터링 상태 가져오기
  const { selectedNode, monitoringEnabled, user } = useNodeContext();
  
  // props > URL 파라미터 > 컨텍스트 순으로 nodeId 결정
  const nodeId = propsNodeId || paramNodeId || selectedNode?.node_id || '';
  
  // 상태
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [cpuData, setCpuData] = useState<CpuData>({ usage: 0 });
  const [usageHistory, setUsageHistory] = useState<CpuUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60); // 그래프에 표시할 최대 데이터 포인트 수
  
  // WebSocket 참조
  const socketRef = useRef<WebSocket | null>(null);
  
  // 시간 카운터 (X축 값)
  const timeCounterRef = useRef<number>(0);

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

  useEffect(() => {
    // nodeId나 인증 정보가 없으면 오류 메시지 표시
    if (!nodeId) {
      setError("유효한 노드 ID가 필요합니다. URL을 확인해주세요.");
      setLoading(false);
      return;
    }

    if (!user?.obscura_key) {
      setError("인증 정보가 필요합니다. 다시 로그인해주세요.");
      setLoading(false);
      return;
    }

    // 이전 WebSocket 연결 정리
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    // 모니터링이 비활성화되어 있으면 연결하지 않음
    if (!monitoringEnabled) {
      setConnected(false);
      return;
    }

    // WebSocket 연결 - 인증 파라미터 추가
    const socket = new WebSocket(
      `ws://1.209.148.143:8000/performance/ws/cpu/${nodeId}?obscura_key=${user.obscura_key}&token=${user.token || ''}`
    );
    socketRef.current = socket;
    
    socket.onopen = () => {
      console.log('📡 WebSocket 연결됨 - CPU 모니터링');
      setConnected(true);
      setError(null);
    };
    
    socket.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        console.log('📊 CPU 데이터 수신:', response);
        
        // 오류 메시지 처리
        if (response.type === 'error') {
          setError(response.message || '서버에서 오류가 발생했습니다.');
          return;
        }
        
        // 서버의 응답 구조에 맞게 처리
        if (response && response.type === 'cpu_metrics' && response.data) {
          const data = response.data;
          
          // CPU 데이터 업데이트
          setCpuData(prevData => ({ 
            ...prevData,
            usage: data.usage || 0,
            speed: data.speed || prevData.speed,
            model: data.model || prevData.model,
            cores: data.cores || prevData.cores,
            logicalProcessors: data.logical_processors || prevData.logicalProcessors,
            processes: data.processes || prevData.processes,
            uptime: data.uptime_seconds ? formatUptime(data.uptime_seconds) : prevData.uptime,
            // 다른 필드도 필요한 경우 여기에 추가
          }));
          
          // 사용량 기록 추가
          setUsageHistory(prev => {
            // 새 데이터 포인트
            const newPoint = {
              time: timeCounterRef.current++,
              usage: data.usage || 0
            };
            
            // 최대 포인트 수 유지
            const newHistory = [...prev, newPoint];
            if (newHistory.length > maxPoints) {
              return newHistory.slice(newHistory.length - maxPoints);
            }
            return newHistory;
          });
        }
        
        setLoading(false);
      } catch (err) {
        console.error('❌ WebSocket 메시지 파싱 실패:', err);
        setError('데이터 파싱 오류');
      }
    };
    
    socket.onerror = (err) => {
      console.error('❌ WebSocket 에러:', err);
      setError('WebSocket 연결 실패');
      setConnected(false);
    };
    
    socket.onclose = (event) => {
      console.log(`🔌 WebSocket 연결 종료 - CPU 모니터링 (코드: ${event.code})`);
      setConnected(false);
      
      if (event.code === 1008) {
        setError('인증에 실패했습니다. 권한이 있는지 확인하세요.');
      }
    };
    
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [nodeId, monitoringEnabled, maxPoints, user?.obscura_key, user?.token]); // 인증 정보 의존성 추가

  return (
    <div>
      {loading && !error ? (
        <div className={styles.loadingState}>데이터 로딩 중...</div>
      ) : error ? (
        <div className={styles.errorState}>{error}</div>
      ) : !connected ? (
        <div className={styles.disconnectedState}>모니터링이 비활성화되었습니다.</div>
      ) : (
        <div className={styles.mainPanel}>
          <div className={styles.usageSection}>
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
          
          <div className={styles.detailsSection}>
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>이용률</span>
                <span className={styles.detailValue}>{cpuData.usage?.toFixed(1) || 0}%</span>
              </div>
              {cpuData.speed && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>속도</span>
                  <span className={styles.detailValue}>{cpuData.speed}</span>
                </div>
              )}
              {cpuData.processes !== undefined && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>프로세스</span>
                  <span className={styles.detailValue}>{cpuData.processes}</span>
                </div>
              )}
              {cpuData.threads !== undefined && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>스레드</span>
                  <span className={styles.detailValue}>{cpuData.threads}</span>
                </div>
              )}
              {cpuData.handles !== undefined && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>핸들</span>
                  <span className={styles.detailValue}>{cpuData.handles}</span>
                </div>
              )}
              {cpuData.uptime && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>작동 시간</span>
                  <span className={styles.detailValue}>{cpuData.uptime}</span>
                </div>
              )}
            </div>
            
            {(cpuData.baseSpeed || cpuData.sockets || cpuData.cores || cpuData.logicalProcessors || cpuData.virtualization) && (
              <div className={styles.detailColumn}>
                {cpuData.baseSpeed && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>기본 속도:</span>
                    <span className={styles.detailValue}>{cpuData.baseSpeed}</span>
                  </div>
                )}
                {cpuData.sockets !== undefined && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>소켓:</span>
                    <span className={styles.detailValue}>{cpuData.sockets}</span>
                  </div>
                )}
                {cpuData.cores !== undefined && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>코어:</span>
                    <span className={styles.detailValue}>{cpuData.cores}</span>
                  </div>
                )}
                {cpuData.logicalProcessors !== undefined && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>논리 프로세서:</span>
                    <span className={styles.detailValue}>{cpuData.logicalProcessors}</span>
                  </div>
                )}
                {cpuData.virtualization && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>가상화:</span>
                    <span className={styles.detailValue}>{cpuData.virtualization}</span>
                  </div>
                )}
              </div>
            )}
            
            {(cpuData.l1Cache || cpuData.l2Cache || cpuData.l3Cache) && (
              <div className={styles.detailColumn}>
                {cpuData.l1Cache && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>L1 캐시:</span>
                    <span className={styles.detailValue}>{cpuData.l1Cache}</span>
                  </div>
                )}
                {cpuData.l2Cache && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>L2 캐시:</span>
                    <span className={styles.detailValue}>{cpuData.l2Cache}</span>
                  </div>
                )}
                {cpuData.l3Cache && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>L3 캐시:</span>
                    <span className={styles.detailValue}>{cpuData.l3Cache}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CpuMonitor;