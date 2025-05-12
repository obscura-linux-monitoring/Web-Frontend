import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/MonitorComponents.module.scss';

interface MemoryData {
  used: number;
  total: number;
  usagePercent: number;
  type: string;
  speed: string;
  slots: number;
}

interface MemoryUsagePoint {
  time: number;
  usage: number;
}

interface MemoryMonitorProps {
  initialData?: MemoryData;
  darkMode?: boolean;
}

const MemoryMonitor: React.FC<MemoryMonitorProps> = ({ 
  initialData,
  darkMode = true
}) => {
  // 더미 데이터
  const defaultData: MemoryData = {
    used: 6.8,
    total: 7.6,
    usagePercent: 89,
    type: "DDR4",
    speed: "3200 MHz",
    slots: 2
  };

  const [memoryData, setMemoryData] = useState<MemoryData>(initialData || defaultData);
  const [usageHistory, setUsageHistory] = useState<MemoryUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60);

  // 실시간 메모리 데이터 시뮬레이션
  useEffect(() => {
    const interval = setInterval(() => {
      const newUsagePercent = Math.floor(Math.random() * 10) + 80; // 80% ~ 90%
      const newUsed = (newUsagePercent * memoryData.total / 100).toFixed(1);
      
      setMemoryData(prev => ({
        ...prev,
        used: parseFloat(newUsed),
        usagePercent: newUsagePercent
      }));

      setUsageHistory(prev => {
        const newPoint = {
          time: prev.length > 0 ? prev[prev.length - 1].time + 1 : 0,
          usage: newUsagePercent
        };
        
        const newHistory = [...prev, newPoint];
        if (newHistory.length > maxPoints) {
          return newHistory.slice(newHistory.length - maxPoints);
        }
        return newHistory;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [maxPoints, memoryData.total]);

  return (
    <div className={`${styles.monitorContainer} ${darkMode ? styles.darkMode : styles.lightMode}`}>
      <div className={styles.headerSection}>
        <div className={styles.title}>
          <h2>메모리</h2>
          <span className={styles.model}>{memoryData.type} {memoryData.speed}</span>
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
        
        <div className={styles.detailsSection}>
          <div className={styles.detailColumn}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>사용 중</span>
              <span className={styles.detailValue}>{memoryData.used}GB</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>사용 가능</span>
              <span className={styles.detailValue}>
                {(memoryData.total - memoryData.used).toFixed(1)}GB
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>전체</span>
              <span className={styles.detailValue}>{memoryData.total}GB</span>
            </div>
          </div>
          
          <div className={styles.detailColumn}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>메모리 타입:</span>
              <span className={styles.detailValue}>{memoryData.type}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>메모리 속도:</span>
              <span className={styles.detailValue}>{memoryData.speed}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>슬롯 사용:</span>
              <span className={styles.detailValue}>{memoryData.slots}개</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemoryMonitor;