import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/MonitorComponents.module.scss';

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
  initialData?: NetworkData;
  darkMode?: boolean;
}

const NetworkMonitor: React.FC<NetworkMonitorProps> = ({ 
  initialData,
  darkMode = true
}) => {
  // 더미 데이터
  const defaultData: NetworkData = {
    name: "Wi-Fi",
    sent: 0,
    received: 0,
    usagePercent: 0,
    ipAddress: "192.168.1.100",
    adapter: "Intel(R) Wi-Fi 6 AX201 160MHz"
  };

  const [networkData, setNetworkData] = useState<NetworkData>(initialData || defaultData);
  const [usageHistory, setUsageHistory] = useState<NetworkUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60);

  // 실시간 네트워크 데이터 시뮬레이션
  useEffect(() => {
    const interval = setInterval(() => {
      const newSent = Math.floor(Math.random() * 500);
      const newReceived = Math.floor(Math.random() * 800);
      const newUsage = Math.floor((newSent + newReceived) / 20); // 단순화된 계산
      
      setNetworkData(prev => ({
        ...prev,
        sent: newSent,
        received: newReceived,
        usagePercent: newUsage
      }));

      setUsageHistory(prev => {
        const newPoint = {
          time: prev.length > 0 ? prev[prev.length - 1].time + 1 : 0,
          usage: newUsage,
          sent: newSent,
          received: newReceived
        };
        
        const newHistory = [...prev, newPoint];
        if (newHistory.length > maxPoints) {
          return newHistory.slice(newHistory.length - maxPoints);
        }
        return newHistory;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [maxPoints]);

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