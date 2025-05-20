import { useState, useEffect, useCallback } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';
import styles from '../../scss/performance/WiFiMonitor.module.scss';

interface WiFiData {
  adapterName: string;
  ssid: string;
  connectionType: string;
  ipv4Address: string;
  ipv6Address: string;
  signalStrength: number; // 0-4 또는 퍼센트로 표시
  frequency: string;
  maxSpeed: number; // Mbps
  currentDownload: number; // Kbps
  currentUpload: number; // Kbps
  totalDownloaded: number; // bytes
  totalUploaded: number; // bytes
  connected: boolean;
}

interface WiFiUsagePoint {
  time: string;
  download: number; // Kbps
  upload: number; // Kbps
}

interface WiFiMonitorProps {
  nodeId?: string;
}

const WiFiMonitor = ({ nodeId: propsNodeId }: WiFiMonitorProps = {}) => {
  const [wifiData, setWifiData] = useState<WiFiData | null>(null);
  const [usageHistory, setUsageHistory] = useState<WiFiUsagePoint[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [maxUsage, setMaxUsage] = useState<number>(500); // 초기 최대값 500Kbps

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

  // WebSocket 연결 및 데이터 처리
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    // WebSocket 연결
    const socket = new WebSocket(`ws://1.209.148.143:8000/influx/ws/wifi/`);
    
    socket.onopen = () => {
      console.log('📡 WiFi 모니터링 WebSocket 연결됨');
      setIsConnected(true);
      setIsLoading(false);
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // WiFi 데이터 처리
        if (data.wifi) {
          setWifiData(data.wifi);
        }
        
        // 사용량 이력 데이터 처리
        if (data.usage) {
          // 시간 형식 변환 및 고정 배열 길이 유지 (60개 데이터 포인트)
          const formattedUsage = data.usage.map((point: any) => ({
            time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            download: point.download,
            upload: point.upload
          }));
          
          setUsageHistory(formattedUsage);
          
          // 최대 사용량 동적 조정 (그래프 스케일링)
          const maxValue = Math.max(
            ...formattedUsage.map((point: WiFiUsagePoint) => 
              Math.max(point.download, point.upload)
            )
          );
          
          // 최대값 여유있게 설정 (가독성 위해)
          const newMaxUsage = Math.max(500, Math.ceil(maxValue * 1.2 / 100) * 100);
          setMaxUsage(newMaxUsage);
        }
        
      } catch (err) {
        console.error('❌ WiFi 데이터 처리 오류:', err);
        setError('데이터 처리 중 오류가 발생했습니다.');
      }
    };
    
    socket.onerror = (err) => {
      console.error('❌ WiFi WebSocket 오류:', err);
      setError('WiFi 모니터링 연결에 실패했습니다.');
      setIsConnected(false);
      setIsLoading(false);
    };
    
    socket.onclose = () => {
      console.log('🔌 WiFi 모니터링 WebSocket 연결 종료');
      setIsConnected(false);
    };
    
    // 컴포넌트 언마운트 시 WebSocket 정리
    return () => {
      socket.close();
    };
  }, [propsNodeId]);

  // 신호 강도에 따른 아이콘 및 바 표시
  const renderSignalStrength = (strength: number) => {
    const bars = [];
    const maxBars = 4;
    
    for (let i = 0; i < maxBars; i++) {
      const isActive = i < Math.ceil((strength / 100) * maxBars);
      bars.push(
        <div 
          key={i} 
          className={`${styles.signalBar} ${isActive ? styles.active : ''}`}
          style={{ height: `${(i + 1) * 3}px` }}
        ></div>
      );
    }
    
    return (
      <div className={styles.signalStrength}>
        {bars}
      </div>
    );
  };

  // 로딩 상태 표시
  if (isLoading) {
    return (
      <div className={styles.mainPanel}>
        <div className={styles.loadingState}>
          <p>Wi-Fi 정보를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  // 오류 상태 표시
  if (error) {
    return (
      <div className={styles.mainPanel}>
        <div className={styles.errorState}>
          <p>⚠️ {error}</p>
          <p>연결을 확인하고 다시 시도하세요.</p>
        </div>
      </div>
    );
  }

  // 연결 끊김 상태 표시
  if (!isConnected) {
    return (
      <div className={styles.mainPanel}>
        <div className={styles.disconnectedState}>
          <p>Wi-Fi 모니터링 연결이 끊어졌습니다.</p>
          <p>페이지를 새로고침하거나 나중에 다시 시도하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mainPanel}>
      {/* Wi-Fi 헤더 및 기본 정보 */}
      <div className={styles.wifiHeader}>
        <div className={styles.wifiTitle}>
          <h2>Wi-Fi</h2>
          {wifiData?.signalStrength && renderSignalStrength(wifiData.signalStrength)}
        </div>
        <div className={styles.wifiInfo}>
          <span>{wifiData?.adapterName || 'Intel(R) Wi-Fi 6E AX211 160MHz'}</span>
        </div>
      </div>
      
      {/* 네트워크 트래픽 그래프 */}
      <div className={styles.usageSection}>
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
                <linearGradient id="downloadGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E91E63" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#E91E63" stopOpacity={0.1}/>
                </linearGradient>
                <linearGradient id="uploadGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#9C27B0" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#9C27B0" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 10, fill: '#999' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: '#999' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                domain={[0, maxUsage]}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#333', 
                  border: 'none', 
                  borderRadius: '4px', 
                  color: '#fff' 
                }}
                formatter={(value: number) => [`${value} Kbps`, undefined]}
              />
              <Area 
                type="monotone" 
                dataKey="download" 
                name="다운로드"
                stroke="#E91E63" 
                fillOpacity={1}
                fill="url(#downloadGradient)" 
              />
              <Area 
                type="monotone" 
                dataKey="upload" 
                name="업로드"
                stroke="#9C27B0"
                fillOpacity={1} 
                fill="url(#uploadGradient)" 
              />
            </AreaChart>
          </ResponsiveContainer>
          
          <div className={styles.chartLabel}>60초</div>
        </div>
      </div>
      
      {/* Wi-Fi 세부 정보 */}
      <div className={styles.detailsSection}>
        <div className={styles.detailColumn}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>현재 속도:</span>
            <div className={styles.speedValues}>
              <div className={styles.downloadSpeed}>
                <span className={styles.speedLabel}>받기</span>
                <span className={styles.detailValue}>
                  {wifiData ? formatSpeed(wifiData.currentDownload) : '0 Kbps'}
                </span>
              </div>
              <div className={styles.uploadSpeed}>
                <span className={styles.speedLabel}>보내기</span>
                <span className={styles.detailValue}>
                  {wifiData ? formatSpeed(wifiData.currentUpload) : '0 Kbps'}
                </span>
              </div>
            </div>
          </div>
          
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>SSID:</span>
            <span className={styles.detailValue}>{wifiData?.ssid || 'YongQ'}</span>
          </div>
          
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>연결 형식:</span>
            <span className={styles.detailValue}>{wifiData?.connectionType || '802.11ax'}</span>
          </div>
          
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>최대 속도:</span>
            <span className={styles.detailValue}>{wifiData?.maxSpeed || 1201} Mbps</span>
          </div>
        </div>
        
        <div className={styles.detailColumn}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>IPv4 주소:</span>
            <span className={styles.detailValue}>{wifiData?.ipv4Address || '172.20.10.3'}</span>
          </div>
          
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>IPv6 주소:</span>
            <span className={styles.detailValue}>
              {wifiData?.ipv6Address || 'fe80::1cab:29bd:5f9e:40dc%11'}
            </span>
          </div>
          
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>총 다운로드:</span>
            <span className={styles.detailValue}>
              {wifiData ? formatBytes(wifiData.totalDownloaded) : '0 MB'}
            </span>
          </div>
          
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>총 업로드:</span>
            <span className={styles.detailValue}>
              {wifiData ? formatBytes(wifiData.totalUploaded) : '0 MB'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WiFiMonitor;