import { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/DiskMonitor.module.scss';
import { useLocation, useParams } from 'react-router-dom';
import { useNodeContext } from '../../context/NodeContext';
import { useAuth } from '../../hooks/useAuth';
import { getToken } from '../../utils/Auth';

interface DiskData {
  // 디스크 기본 정보
  device: string;  // 디바이스 이름 (C:)
  model: string;   // 모델명
  
  // 사용량 정보
  usage_percent: number;
  total: number;   // GB 단위
  free: number;    // GB 단위
  used: number;    // GB 단위
  
  // 성능 정보
  read_speed: number;     // MB/s
  write_speed: number;    // MB/s
  active_time: number;    // %
  response_time: number;  // ms
  
  // 시스템 정보
  is_system_disk: boolean;
  has_page_file: boolean;
  filesystem_type: string;
  interface_type: string; // SSD(NVMe) 등
}

interface DiskActivityPoint {
  time: number;
  activity: number;
}

interface DiskSpeedPoint {
  time: number;
  read: number;
  write: number;
}

interface DiskMonitorProps {
  nodeId?: string;
  diskId?: string;
}

const DiskMonitor = ({ nodeId: propsNodeId, diskId = '0' }: DiskMonitorProps) => {
  const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();
  const { selectedNode, monitoringEnabled = true } = useNodeContext();
  const { isAuthenticated = true } = useAuth();
  const location = useLocation();
  
  const nodeId = propsNodeId || paramNodeId || selectedNode?.node_id || '';
  
  // 컴포넌트의 마운트 상태 추적
  const isMounted = useRef(true);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  
  // 초기 디스크 데이터
  const [diskData, setDiskData] = useState<DiskData>({
    device: "C:",
    model: "SAMSUNG MZVL2256HCHQ-00B",
    usage_percent: 7,
    total: 239,
    free: 0,
    used: 239,
    read_speed: 32.8,
    write_speed: 1.1,
    active_time: 7,
    response_time: 0.6,
    is_system_disk: true,
    has_page_file: true,
    filesystem_type: "NTFS",
    interface_type: "SSD(NVMe)"
  });
  
  // 디스크 활동 및 속도 히스토리
  const [activityHistory, setActivityHistory] = useState<DiskActivityPoint[]>([]);
  const [speedHistory, setSpeedHistory] = useState<DiskSpeedPoint[]>([]);
  const [maxPoints] = useState<number>(60);  // 60초 데이터
  const [maxSpeed, setMaxSpeed] = useState<number>(250); // 초기 최대 속도 설정
  
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
      
      // WebSocket URL 구성 (실제 서버 주소로 변경 필요)
      const socket = new WebSocket(`ws://1.209.148.143:8000/performance/ws/disk/${nodeId}?token=${token}`);
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
        
        // 서버의 응답 구조에 맞게 처리하는 부분 수정
        if (response && response.type === 'disk_metrics' && response.data) {
          const serverData = response.data;
          const diskInfo = serverData.primary_disk || (serverData.disks && serverData.disks.length ? serverData.disks[0] : null);

          if (diskInfo) {
            // 디버깅: 받은 데이터 확인
            console.log("받은 디스크 데이터:", diskInfo);

            // 디바이스 명칭 처리 - Linux 경로에서 디스크 이름 추출
            const deviceName = diskInfo.device || "Unknown";
            // 마지막 부분만 추출 (예: '/dev/sda1' -> 'sda1' 또는 '/dev/mapper/ubuntu--vg-lv--0' -> 'ubuntu-vg-lv-0')
            let shortDeviceName = deviceName.split('/').pop() || deviceName;
            // 이중 하이픈을 단일 하이픈으로 변환 (예: 'ubuntu--vg-lv--0' -> 'ubuntu-vg-lv-0')
            shortDeviceName = shortDeviceName.replace(/--/g, '-');

            // 데이터 변환 - 백엔드 데이터를 프론트엔드 형식으로 매핑
            const newDiskData: DiskData = {
              device: shortDeviceName,
              model: diskInfo.model || "Unknown",
              
              // 사용량 정보 - 서버에서 이미 계산된 값 사용
              usage_percent: diskInfo.usage_percent || 0,
              total: diskInfo.total || 0,
              free: diskInfo.free || 0,
              used: diskInfo.used || 0,
              
              // 성능 정보 - 서버에서 이미 계산된 값 사용
              read_speed: diskInfo.read_speed || 0,
              write_speed: diskInfo.write_speed || 0,
              active_time: diskInfo.active_time || 0,
              response_time: diskInfo.response_time || 0,
              
              // 시스템 정보
              is_system_disk: diskInfo.is_system_disk || false,
              has_page_file: diskInfo.has_page_file || false,
              filesystem_type: diskInfo.filesystem_type || "Unknown",
              interface_type: diskInfo.interface_type || "Unknown"
            };
            
            // 디스크 데이터 업데이트
            setDiskData(newDiskData);
            
            // 활동 히스토리 업데이트
            setActivityHistory(prev => {
              const time = timeCounterRef.current++;
              const newPoint = { time, activity: newDiskData.active_time };
              const newHistory = [...prev, newPoint];
              return newHistory.length > maxPoints ? newHistory.slice(-maxPoints) : newHistory;
            });
            
            // 속도 히스토리 업데이트
            setSpeedHistory(prev => {
              const time = timeCounterRef.current;
              const newPoint = { 
                time, 
                read: newDiskData.read_speed, 
                write: newDiskData.write_speed 
              };
              const newHistory = [...prev, newPoint];
              
              // 최대 속도 자동 조정 - 현재값보다 크면 업데이트
              const currentMaxSpeed = Math.max(
                ...newHistory.map(p => Math.max(p.read, p.write)),
                50 // 최소 50MB/s
              );
              
              if (currentMaxSpeed > maxSpeed * 0.8) {
                setMaxSpeed(Math.ceil(currentMaxSpeed / 50) * 50); // 50 단위로 반올림
              }
              
              return newHistory.length > maxPoints ? newHistory.slice(-maxPoints) : newHistory;
            });
            
            setLoading(false);
          }
        }
      } catch (err) {
        if (isMounted.current) {
          console.error('❌ WebSocket 메시지 파싱 실패:', err);
          console.error('원본 데이터:', event.data);
          setError('데이터 파싱 오류');
        }
      }
    };
      
      socket.onclose = (event) => {
        if (!isMounted.current) return;
        
        connectionStatusRef.current = "연결 끊김";
        setConnected(false);
        
        // 정상 종료가 아닌 경우에만 재연결 시도
        if (!event.wasClean && monitoringEnabled) {
          console.log("🔄 WebSocket 연결 끊김. 재연결 시도 중...");
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted.current && monitoringEnabled) {
              connectToServer();
            }
          }, 3000);
        }
      };
      
      socket.onerror = (error) => {
        if (!isMounted.current) return;
        console.error("❌ WebSocket 오류:", error);
        connectionStatusRef.current = "연결 오류";
        setError('서버 연결 오류가 발생했습니다.');
      };
      
      socketRef.current = socket;
      
    } catch (error) {
      if (!isMounted.current) return;
      
      setError('WebSocket 연결을 생성할 수 없습니다.');
      connectionStatusRef.current = "연결 실패";
      
      // 모니터링이 활성화된 경우에만 재연결 시도
      if (monitoringEnabled && isMounted.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted.current) {
            connectionStatusRef.current = "재연결 시도 중...";
            connectToServer();
          }
        }, 5000);
      }
    }
  }, [nodeId, monitoringEnabled, cleanupConnections]);

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
  
  // 연결 상태 표시 스타일
  const connectionStatusStyle = {
    position: 'absolute' as const,
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
    pointerEvents: 'none' as const,
    filter: 'grayscale(100%)'
  };

  // 렌더링
  return (
    <div className={styles.diskMonitorContainer}>
      {!monitoringEnabled ? (
        <div className={styles.disconnectedState}>
          <div>모니터링이 비활성화되었습니다</div>
          <div>데이터 수집을 시작하려면 모니터링을 활성화하세요</div>
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
          
          {/* 헤더 영역 */}
          <div className={styles.headerSection}>
            <div className={styles.diskTitle}>
              디스크 {diskId}({diskData.device})
            </div>
            <div className={styles.diskModel}>
              {diskData.model}
            </div>
          </div>
          
          {/* 활동 그래프 영역 */}
          <div className={styles.chartSection} style={!monitoringEnabled ? disabledStyle : {}}>
            {/* 첫 번째 그래프: 디스크 활동률 */}
            <div className={styles.chartContainer}>
              <div className={styles.chartHeader}>
                <div className={styles.chartLabel}>60초</div>
                <div className={styles.chartMaxValue}>100%</div>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart
                  data={activityHistory}
                  margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7FBA00" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#7FBA00" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="time" hide={true} />
                  <YAxis domain={[0, 100]} hide={true} />
                  <Tooltip 
                    formatter={(value) => [`${value}%`, '활동률']}
                    contentStyle={{ backgroundColor: '#333', border: 'none', borderRadius: '4px' }}
                    labelFormatter={() => ''}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="activity" 
                    stroke="#7FBA00" 
                    fill="url(#colorActivity)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className={styles.chartFooter}>
                <div>디스크 활동 속도</div>
                <div>0</div>
              </div>
            </div>
            
            {/* 두 번째 그래프: 디스크 읽기/쓰기 속도 */}
            <div className={styles.chartContainer}>
              <div className={styles.chartHeader}>
                <div className={styles.chartLabel}>60초</div>
                <div className={styles.chartMaxValue}>{maxSpeed}MB/s</div>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart
                  data={speedHistory}
                  margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="colorRead" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3498db" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3498db" stopOpacity={0.2}/>
                    </linearGradient>
                    <linearGradient id="colorWrite" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e74c3c" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#e74c3c" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="time" hide={true} />
                  <YAxis domain={[0, maxSpeed]} hide={true} />
                  <Tooltip 
                    formatter={(value) => [`${typeof value === 'number' ? value.toFixed(1) : value} MB/s`, '']}
                    contentStyle={{ backgroundColor: '#333', border: 'none', borderRadius: '4px' }}
                    labelFormatter={() => ''}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="read" 
                    name="읽기 속도"
                    stroke="#3498db" 
                    fill="url(#colorRead)" 
                    isAnimationActive={false}
                    strokeWidth={1}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="write" 
                    name="쓰기 속도"
                    stroke="#e74c3c" 
                    fill="url(#colorWrite)" 
                    isAnimationActive={false}
                    strokeWidth={1}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className={styles.chartFooter}>
                <div>디스크 전송 속도</div>
                <div>0</div>
              </div>
            </div>
          </div>
          
          {/* 메트릭 정보 영역 */}
          <div className={styles.metricsSection} style={!monitoringEnabled ? disabledStyle : {}}>
            <div className={styles.metricRow}>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>활성 시간</div>
                <div className={styles.metricValue}>{diskData.active_time}%</div>
              </div>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>평균 응답 시간</div>
                <div className={styles.metricValue}>{diskData.response_time}ms</div>
              </div>
            </div>
            
            <div className={styles.metricRow}>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>읽기 속도</div>
                <div className={styles.metricValue}>{diskData.read_speed}MB/s</div>
              </div>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>쓰기 속도</div>
                <div className={styles.metricValue}>{diskData.write_speed}MB/s</div>
              </div>
            </div>
            
            <div className={styles.metricRow}>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>용량</div>
                <div className={styles.metricValue}>{diskData.total}GB</div>
              </div>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>포맷</div>
                <div className={styles.metricValue}>{diskData.filesystem_type}</div>
              </div>
            </div>
            
            <div className={styles.metricRow}>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>시스템 디스크</div>
                <div className={styles.metricValue}>{diskData.is_system_disk ? '예' : '아니오'}</div>
              </div>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>페이지 파일</div>
                <div className={styles.metricValue}>{diskData.has_page_file ? '예' : '아니오'}</div>
              </div>
            </div>
            
            <div className={styles.metricRow}>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>종류</div>
                <div className={styles.metricValue}>{diskData.interface_type}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DiskMonitor;