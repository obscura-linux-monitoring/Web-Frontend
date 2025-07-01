import { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/MemoryMonitor.module.scss';
import '../../scss/performance/performance_mobile/MemoryMonitor.module.mobile.scss';
import { useLocation, useParams } from 'react-router-dom';
import { useNodeContext } from '../../context/NodeContext';
import { useAuth } from '../../hooks/useAuth';
import { getToken } from '../../utils/Auth';

// 이더넷 데이터 인터페이스 (필요한 필드만)
interface EthernetData {
  // 어댑터 이름
  adapterName: string;
  // 연결 상태
  connected: boolean;
  // SSID (Wi-Fi 이름)
  ssid: string;
  // 연결 형식 (802.11ac 등)
  connectionType: string;
  // IPv4 주소
  ipv4Address: string;
  // IPv6 주소
  ipv6Address: string;
  // 신호 강도
  signalStrength: number;
  // 현재 속도
  currentDownload: number; // Kbps
  currentUpload: number; // Kbps
}

// 이더넷 사용량 히스토리 포인트
interface EthernetUsagePoint {
  time: number;
  download: number; // Kbps
  upload: number; // Kbps
}

// 컴포넌트 Props
interface EthernetMonitorProps {
  nodeId?: string;
}

const EthernetMonitor = ({ nodeId: propsNodeId }: EthernetMonitorProps = {}) => {
  // 노드 및 인증 관련 데이터 가져오기
  const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();
  const { selectedNode, monitoringEnabled = true } = useNodeContext();
  const { isAuthenticated = true } = useAuth();
  const location = useLocation();
  
  // 노드 ID 결정 (우선순위: props > URL 파라미터 > 선택된 노드)
  const nodeId = propsNodeId || paramNodeId || selectedNode?.node_id || '';
  const isMounted = useRef(true);
  
  // 상태 관리
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  
  // 초기 이더넷 데이터 상태 (이미지에 표시된 항목들만)
  const [ethernetData, setEthernetData] = useState<EthernetData>({ 
    adapterName: '',
    connected: false,
    ssid: 'Wired Connection',  // 이더넷에 적합한 값
    connectionType: 'Ethernet',
    ipv4Address: '',
    ipv6Address: '',
    signalStrength: 4,  // 이더넷은 항상 최대 신호 강도
    currentDownload: 0,
    currentUpload: 0
  });
  
  // 사용량 히스토리 상태
  const [usageHistory, setUsageHistory] = useState<EthernetUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60);
  const [maxUsage, setMaxUsage] = useState<number>(500);
  
  // 참조 변수들
  const socketRef = useRef<WebSocket | null>(null);
  const timeCounterRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const connectionStatusRef = useRef<string>("연결 준비 중...");

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
      
      const socket = new WebSocket(`ws://1.209.148.143:8000/performance/ws/ethernet/${nodeId}?token=${token}`);
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
          
          if (response.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          
          if (response.type === 'error') {
            setError(response.message || '서버에서 오류가 발생했습니다.');
            return;
          }
          
          // Wi-Fi 데이터 처리
          if (response.type === 'wifi_data' && response.wifi) {
            const wifi = response.wifi;
            
            setEthernetData(prevData => ({
              adapterName: wifi.adapterName || '',
              connected: wifi.connected || false,
              ssid: wifi.ssid || 'Wired Connection',
              connectionType: wifi.connectionType || 'Ethernet',
              ipv4Address: wifi.ipv4Address || '',
              ipv6Address: wifi.ipv6Address || '',
              signalStrength: wifi.signalStrength || 4,  // 이더넷은 항상 최대 신호 강도
              currentDownload: wifi.currentDownload || 0,
              currentUpload: wifi.currentUpload || 0
            }));
          }
          
          if (response.usage) {
            const formattedUsage = response.usage.map((point: any) => ({
              time: timeCounterRef.current++,
              download: point.download || 0,
              upload: point.upload || 0
            }));
            
            setUsageHistory(prev => {
              const newHistory = [...prev, ...formattedUsage];
              if (newHistory.length > maxPoints) {
                return newHistory.slice(newHistory.length - maxPoints);
              }
              return newHistory;
            });
            
            const maxValue = Math.max(
              ...formattedUsage.map((point: EthernetUsagePoint) => 
                Math.max(point.download || 0, point.upload || 0)
              ),
              1
            );
            
            const newMaxUsage = Math.max(500, Math.ceil(maxValue * 1.2 / 100) * 100);
            setMaxUsage(newMaxUsage);
          }
          
          setLoading(false);
        } catch (err) {
          if (isMounted.current) {
            console.error('❌ WebSocket 메시지 파싱 실패:', err);
            setError('데이터 파싱 오류');
          }
        }
      };
      
      socket.onerror = (err) => {
        if (!isMounted.current) return;
        
        console.error('❌ 이더넷 WebSocket 오류:', err);
        setError('이더넷 모니터링 연결에 실패했습니다.');
        setConnected(false);
        setLoading(false);
        connectionStatusRef.current = "연결 실패";
      };
      
      socket.onclose = (event) => {
        if (!isMounted.current) return;
        
        console.log(`🔌 이더넷 모니터링 WebSocket 연결 종료 (코드: ${event.code})`);
        setConnected(false);
        connectionStatusRef.current = "연결 종료됨";
        
        if (!event.wasClean && monitoringEnabled) {
          connectionStatusRef.current = "재연결 준비 중...";
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted.current) {
              connectionStatusRef.current = "재연결 시도 중...";
              console.log('🔄 이더넷 모니터링 WebSocket 재연결 시도...');
              connectToServer();
            }
          }, 5000);
        }
      };
      
      socketRef.current = socket;
      
    } catch (error) {
      if (!isMounted.current) return;
      
      console.error('WebSocket 생성 오류:', error);
      setError('연결 오류가 발생했습니다.');
      setLoading(false);
      connectionStatusRef.current = "연결 오류";
      
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

  // 컴포넌트 마운트/언마운트 처리
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // 노드 ID 또는 모니터링 상태 변경 시 재연결
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

  // 스타일 정의
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

  // 속도 포맷 함수
  const formatSpeed = (kbps: number): string => {
    if (kbps < 1000) {
      return `${kbps.toFixed(0)}Kbps`;
    } else {
      return `${(kbps / 1000).toFixed(0)}Mbps`;
    }
  };

  // 신호 강도 아이콘 렌더링
  const renderSignalBars = (strength: number) => {
    const bars = [];
    for (let i = 0; i < 4; i++) {
      bars.push(
        <div
          key={i}
          style={{
            width: '4px',
            height: `${8 + i * 4}px`,
            backgroundColor: i < strength ? '#fff' : 'rgba(255,255,255,0.3)',
            marginRight: '2px',
            borderRadius: '1px'
          }}
        />
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'end', marginLeft: '8px' }}>
        {bars}
      </div>
    );
  };

  // 렌더링 부분
  return (
    <div className={styles.mainPanel}>
      {!monitoringEnabled ? (
        <div className={styles.disconnectedState}>
          <div style={{ fontSize: '16px', marginBottom: '10px' }}>모니터링이 비활성화되었습니다</div>
          <div style={{ fontSize: '13px', opacity: 0.7 }}>데이터 수집을 시작하려면 모니터링을 활성화하세요</div>
        </div>
      ) : loading && !error ? (
        <div className={styles.loadingState}>이더넷 정보를 불러오는 중입니다...</div>
      ) : error ? (
        <div className={styles.errorState}>
          <p>⚠️ {error}</p>
          <p>연결을 확인하고 다시 시도하세요.</p>
          <button className={styles.retryButton} onClick={() => connectToServer()}>다시 시도</button>
        </div>
      ) : !connected ? (
        <div className={styles.disconnectedState}>
          <p>이더넷 모니터링 연결이 끊어졌습니다.</p>
          <p>{connectionStatusRef.current}</p>
          <button className={styles.retryButton} onClick={() => connectToServer()}>지금 재연결</button>
        </div>
      ) : (
        <>
          {/* 연결 상태 표시 */}
          {connected && (
            <div style={connectionStatusStyle}>
              {connectionStatusRef.current}
            </div>
          )}
          
          {/* 네트워크 트래픽 그래프 */}
          <div className={styles.usageSection} style={!monitoringEnabled ? disabledStyle : {}}>
            <div className={styles.usageHeader}>
              <span>처리량</span>
              <span className={styles.maxUsage}>{maxUsage} Kbps</span>
            </div>
            
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={usageHistory}
                  margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="ethernetDownloadGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2196F3" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#2196F3" stopOpacity={0.1}/>
                    </linearGradient>
                    <linearGradient id="ethernetUploadGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00BCD4" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#00BCD4" stopOpacity={0.1}/>
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
                    domain={[0, maxUsage]} 
                    axisLine={false}
                    tick={false}
                  />
                  <Tooltip 
                    formatter={(value, name) => [
                      `${value} Kbps`, 
                      name === 'download' ? '다운로드' : '업로드'
                    ]}
                    contentStyle={{ backgroundColor: '#333', border: 'none', borderRadius: '4px' }}
                    labelFormatter={() => ''}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="download" 
                    name="download"
                    stroke="#2196F3" 
                    fillOpacity={1}
                    fill="url(#ethernetDownloadGradient)" 
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="upload" 
                    name="upload"
                    stroke="#00BCD4"
                    fillOpacity={1} 
                    fill="url(#ethernetUploadGradient)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              
              <div className={styles.chartLabel}>60초</div>
            </div>
          </div>
          
          {/* Wi-Fi 정보 (이미지 기준) */}
          <div className={styles.detailsSection} style={!monitoringEnabled ? disabledStyle : {}}>
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>보내기:</span>
                <span className={styles.detailValue} style={{ color: '#ff8800' }}>
                  {formatSpeed(ethernetData.currentUpload)}
                </span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>받기:</span>
                <span className={styles.detailValue} style={{ color: '#ff8800' }}>
                  {formatSpeed(ethernetData.currentDownload)}
                </span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>어댑터 이름:</span>
                <span className={styles.detailValue}>{ethernetData.adapterName}</span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>SSID:</span>
                <span className={styles.detailValue}>{ethernetData.ssid}</span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>연결 형식:</span>
                <span className={styles.detailValue}>{ethernetData.connectionType}</span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>IPv4 주소:</span>
                <span className={styles.detailValue}>{ethernetData.ipv4Address}</span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>IPv6 주소:</span>
                <span className={styles.detailValue}>{ethernetData.ipv6Address}</span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>신호 강도:</span>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span className={styles.detailValue}></span>
                  {renderSignalBars(ethernetData.signalStrength)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default EthernetMonitor;