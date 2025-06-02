import { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/MemoryMonitor.module.scss';
import { useLocation, useParams } from 'react-router-dom';
import { useNodeContext } from '../../context/NodeContext';
import { useAuth } from '../../hooks/useAuth';
import { getToken } from '../../utils/Auth';

// 이더넷 데이터 인터페이스
interface EthernetData {
  // 기본 필드
  ipv4Address: string;
  ipv6Address: string;
  macAddress: string;
  interfaceName: string;
  adapterName: string;
  maxSpeed: number; // Mbps
  currentDownload: number; // Kbps
  currentUpload: number; // Kbps
  totalDownloaded: number; // bytes
  totalUploaded: number; // bytes
  connected: boolean;
  
  // 추가 필드
  mtu: number;
  rxErrors: number;
  txErrors: number;
  rxDropped: number;
  txDropped: number;
  rxPackets: number;
  txPackets: number;
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
  
  // 초기 이더넷 데이터 상태
  const [ethernetData, setEthernetData] = useState<EthernetData>({ 
    ipv4Address: '0.0.0.0',
    ipv6Address: '',
    macAddress: '00:00:00:00:00:00',
    interfaceName: 'eth0',
    adapterName: '이더넷 어댑터',
    maxSpeed: 1000,
    currentDownload: 0,
    currentUpload: 0,
    totalDownloaded: 0,
    totalUploaded: 0,
    connected: false,
    mtu: 1500,
    rxErrors: 0,
    txErrors: 0,
    rxDropped: 0,
    txDropped: 0,
    rxPackets: 0,
    txPackets: 0
  });
  
  // 사용량 히스토리 상태
  const [usageHistory, setUsageHistory] = useState<EthernetUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60);
  const [maxUsage, setMaxUsage] = useState<number>(500); // 초기 최대값 500Kbps
  
  // 참조 변수들
  const socketRef = useRef<WebSocket | null>(null);
  const timeCounterRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const connectionStatusRef = useRef<string>("연결 준비 중...");

  // 모든 연결 정리 함수
  const cleanupConnections = useCallback(() => {
    // WebSocket 정리
    if (socketRef.current) {
      socketRef.current.onclose = null; // onclose 핸들러 제거하여 재연결 시도 방지
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
      const socket = new WebSocket(`ws://1.209.148.143:8000/performance/ws/ethernet/${nodeId}?token=${token}`);
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
          
          // 이더넷 데이터 처리 (백엔드는 wifi_data 형식으로 전송)
          if (response.type === 'wifi_data' && response.wifi) {
            const wifi = response.wifi;
            
            // 이더넷 데이터 업데이트
            setEthernetData(prevData => ({
              ipv4Address: wifi.ipv4Address || prevData.ipv4Address,
              ipv6Address: wifi.ipv6Address || prevData.ipv6Address,
              macAddress: wifi.macAddress || prevData.macAddress,
              interfaceName: wifi.interfaceName || prevData.interfaceName,
              adapterName: wifi.adapterName || prevData.adapterName,
              maxSpeed: wifi.maxSpeed || prevData.maxSpeed,
              currentDownload: wifi.currentDownload || 0,
              currentUpload: wifi.currentUpload || 0,
              totalDownloaded: wifi.totalDownloaded || prevData.totalDownloaded,
              totalUploaded: wifi.totalUploaded || prevData.totalUploaded,
              connected: wifi.connected || false,
              mtu: wifi.mtu || prevData.mtu,
              rxErrors: wifi.rxErrors || prevData.rxErrors,
              txErrors: wifi.txErrors || prevData.txErrors,
              rxDropped: wifi.rxDropped || prevData.rxDropped,
              txDropped: wifi.txDropped || prevData.txDropped,
              rxPackets: wifi.rxPackets || prevData.rxPackets,
              txPackets: wifi.txPackets || prevData.txPackets
            }));
          }
          
          // 사용량 이력 데이터 처리
          if (response.usage) {
            // 시간 형식 변환 및 처리
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
            
            // 최대 사용량 동적 조정 (그래프 스케일링)
            const maxValue = Math.max(
              ...formattedUsage.map((point: EthernetUsagePoint) => 
                Math.max(point.download || 0, point.upload || 0)
              ),
              1 // 최소값 1 보장
            );
            
            // 최대값 여유있게 설정 (가독성 위해)
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
        
        // 비정상 종료인 경우 자동 재연결 시도
        if (!event.wasClean && monitoringEnabled) {
          connectionStatusRef.current = "재연결 준비 중...";
          // 5초 후 재연결 시도
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
  
  // 페이지 이동 시 연결 정리
  useEffect(() => {
    return () => { cleanupConnections(); };
  }, [location, cleanupConnections]);
  
  // 브라우저 종료 시 연결 정리
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

  // 데이터 포맷 함수
  const formatBytes = (bytes: number, decimals = 2): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatSpeed = (kbps: number): string => {
    if (kbps < 1000) {
      return `${kbps.toFixed(0)} Kbps`;
    } else {
      return `${(kbps / 1000).toFixed(2)} Mbps`;
    }
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
          
          {/* 이더넷 헤더 및 기본 정보 */}
          <div className={styles.headerSection}>
            <div className={styles.titleArea}>
              <h2>이더넷</h2>
              <div className={styles.connectionStatus}>
                <span className={`${styles.statusIndicator} ${ethernetData.connected ? styles.connected : styles.disconnected}`}></span>
                <span>{ethernetData.connected ? '연결됨' : '연결 안됨'}</span>
              </div>
            </div>
            <div className={styles.adapterInfo}>
              <span>{ethernetData.adapterName || '이더넷 어댑터'}</span>
            </div>
          </div>
          
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
              
              {/* 차트 범례 */}
              <div className={styles.chartLegend}>
                <div className={styles.legendItem}>
                  <span className={styles.legendColor} style={{ backgroundColor: '#2196F3' }}></span>
                  <span className={styles.legendLabel}>다운로드</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendColor} style={{ backgroundColor: '#00BCD4' }}></span>
                  <span className={styles.legendLabel}>업로드</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* 이더넷 세부 정보 */}
          <div className={styles.detailsSection} style={!monitoringEnabled ? disabledStyle : {}}>
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>현재 속도:</span>
                <div className={styles.speedValues}>
                  <div className={styles.downloadSpeed}>
                    <span className={styles.speedLabel}>받기</span>
                    <span className={styles.detailValue}>
                      {formatSpeed(ethernetData.currentDownload)}
                    </span>
                  </div>
                  <div className={styles.uploadSpeed}>
                    <span className={styles.speedLabel}>보내기</span>
                    <span className={styles.detailValue}>
                      {formatSpeed(ethernetData.currentUpload)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>인터페이스:</span>
                <span className={styles.detailValue}>{ethernetData.interfaceName}</span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>최대 속도:</span>
                <span className={styles.detailValue}>{ethernetData.maxSpeed} Mbps</span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>MTU:</span>
                <span className={styles.detailValue}>{ethernetData.mtu}</span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>IPv4 주소:</span>
                <span className={styles.detailValue}>{ethernetData.ipv4Address}</span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>IPv6 주소:</span>
                <span className={styles.detailValue}>
                  {ethernetData.ipv6Address || '-'}
                </span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>MAC 주소:</span>
                <span className={styles.detailValue}>{ethernetData.macAddress}</span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>연결 상태:</span>
                <span className={styles.detailValue}>
                  {ethernetData.connected ? '연결됨' : '연결 안됨'}
                </span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>총 다운로드:</span>
                <span className={styles.detailValue}>
                  {formatBytes(ethernetData.totalDownloaded)}
                </span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>총 업로드:</span>
                <span className={styles.detailValue}>
                  {formatBytes(ethernetData.totalUploaded)}
                </span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>RX 패킷:</span>
                <span className={styles.detailValue}>
                  {ethernetData.rxPackets.toLocaleString()}
                </span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>TX 패킷:</span>
                <span className={styles.detailValue}>
                  {ethernetData.txPackets.toLocaleString()}
                </span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>RX 에러:</span>
                <span className={styles.detailValue}>
                  {ethernetData.rxErrors.toLocaleString()}
                </span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>TX 에러:</span>
                <span className={styles.detailValue}>
                  {ethernetData.txErrors.toLocaleString()}
                </span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>RX 드롭:</span>
                <span className={styles.detailValue}>
                  {ethernetData.rxDropped.toLocaleString()}
                </span>
              </div>
              
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>TX 드롭:</span>
                <span className={styles.detailValue}>
                  {ethernetData.txDropped.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default EthernetMonitor;