import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/MonitorComponents.module.scss';
import '../../scss/performance/performance_mobile/MonitorComponents.module.mobile.scss';
import { getToken } from '../../utils/Auth';

interface NetworkData {
  name: string;
  sent: number;
  received: number;
  usagePercent: number;
  ipAddress: string;
  adapter: string;
}

interface NetworkUsagePoint {
  time: number;
  usage: number;
  sent: number;
  received: number;
}

interface NetworkMonitorProps {
  nodeId?: string;
  networkType?: 'ethernet' | 'wifi';
  initialData?: NetworkData;
  darkMode?: boolean;
}

const NetworkMonitor: React.FC<NetworkMonitorProps> = ({ 
  nodeId,
  networkType = 'ethernet',
  initialData,
  darkMode = true
}) => {
  const defaultData: NetworkData = {
    name: networkType === 'wifi' ? "Wi-Fi" : "Ethernet",
    sent: 0,
    received: 0,
    usagePercent: 0,
    ipAddress: "0.0.0.0",
    adapter: "Network Adapter"
  };

  const [networkData, setNetworkData] = useState<NetworkData>(initialData || defaultData);
  const [usageHistory, setUsageHistory] = useState<NetworkUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60);

  // WebSocket으로 실시간 네트워크 데이터 수신
  useEffect(() => {
    const token = getToken();
    if (!token || !nodeId) {
      console.warn('토큰 또는 노드 ID가 없습니다.');
      return;
    }

    const wsUrl = networkType === 'wifi'
      ? `ws://1.209.148.143:8000/performance/ws/wifi/${nodeId}?token=${token}`
      : `ws://1.209.148.143:8000/performance/ws/network/${nodeId}?token=${token}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`${networkType} WebSocket 연결됨`);
    };

    ws.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        
        if (response.type === 'network_metrics') {
          const data = response.data;
          const primaryInterface = data.primary_interface || {};

          const sent = primaryInterface.tx_speed_kbps || 0;
          const received = primaryInterface.rx_speed_kbps || 0;
          const usage = Math.floor((sent + received) / 20);

          // 네트워크 데이터 업데이트
          setNetworkData({
            name: primaryInterface.name || (networkType === 'wifi' ? 'Wi-Fi' : 'Ethernet'),
            sent,
            received,
            usagePercent: usage,
            ipAddress: primaryInterface.ipv4 || "0.0.0.0",
            adapter: primaryInterface.name || "Network Adapter"
          });

          // 히스토리 업데이트
          setUsageHistory(prev => {
            const newPoint = {
              time: prev.length > 0 ? prev[prev.length - 1].time + 1 : 0,
              usage,
              sent,
              received
            };
            
            const newHistory = [...prev, newPoint];
            return newHistory.length > maxPoints 
              ? newHistory.slice(-maxPoints) 
              : newHistory;
          });
        }
      } catch (error) {
        console.error('네트워크 데이터 파싱 오류:', error);
      }
    };

    ws.onerror = (error) => {
      console.error(`${networkType} WebSocket 오류:`, error);
    };

    ws.onclose = () => {
      console.log(`${networkType} WebSocket 연결 종료`);
    };

    return () => {
      ws.close();
    };
  }, [nodeId, networkType, maxPoints]);

  return (
    <div className={`${styles.monitorContainer} ${darkMode ? styles.darkMode : styles.lightMode}`}>
      <div className={styles.headerSection}>
        <div className={styles.title}>
          <h2>{networkData.name}</h2>
          <span className={styles.model}>{networkData.adapter}</span>
        </div>
      </div>
      
      <div className={styles.mainContent}>
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
                  <linearGradient id="colorNetwork" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8661C5" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8661C5" stopOpacity={0.2}/>
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
                  formatter={(value, name) => {
                    if (name === 'usage') return [`${value}%`, '이용률'];
                    if (name === 'sent') return [`${value} Kbps`, '보내기'];
                    if (name === 'received') return [`${value} Kbps`, '받기'];
                    return [value, name];
                  }}
                  contentStyle={{ backgroundColor: '#333', border: 'none', borderRadius: '4px' }}
                  labelFormatter={() => ''}
                />
                <Area 
                  type="monotone" 
                  dataKey="usage" 
                  stroke="#8661C5" 
                  fillOpacity={1} 
                  fill="url(#colorNetwork)" 
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className={styles.chartLabel}>네트워크 활동</div>
          </div>
        </div>
        
        <div className={styles.detailsSection}>
          <div className={styles.detailColumn}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>어댑터:</span>
              <span className={styles.detailValue}>{networkData.adapter}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>IP 주소:</span>
              <span className={styles.detailValue}>{networkData.ipAddress}</span>
            </div>
          </div>
          
          <div className={styles.detailColumn}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>보내기:</span>
              <span className={styles.detailValue}>{networkData.sent} Kbps</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>받기:</span>
              <span className={styles.detailValue}>{networkData.received} Kbps</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>사용량:</span>
              <span className={styles.detailValue}>{networkData.usagePercent}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkMonitor;