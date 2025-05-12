import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/MonitorComponents.module.scss';

interface DiskData {
  name: string;
  type: string;
  usagePercent: number;
  readSpeed: number;
  writeSpeed: number;
  capacity: number;
  free: number;
}

interface DiskUsagePoint {
  time: number;
  usage: number;
}

interface DiskMonitorProps {
  diskIndex?: number;
  initialData?: DiskData;
  darkMode?: boolean;
}

const DiskMonitor: React.FC<DiskMonitorProps> = ({ 
  diskIndex = 0,
  initialData,
  darkMode = true
}) => {
  // 더미 데이터
  const defaultData: DiskData = {
    name: `디스크 ${diskIndex}`,
    type: "SSD(NVMe)",
    usagePercent: 2,
    readSpeed: 2500,
    writeSpeed: 1800,
    capacity: 500,
    free: 320
  };

  const [diskData, setDiskData] = useState<DiskData>(initialData || defaultData);
  const [usageHistory, setUsageHistory] = useState<DiskUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60);

  // 실시간 디스크 데이터 시뮬레이션
  useEffect(() => {
    const interval = setInterval(() => {
      const newUsage = Math.floor(Math.random() * 5) + 1; // 1% ~ 5%
      const newReadSpeed = Math.floor(Math.random() * 500) + 2000;
      const newWriteSpeed = Math.floor(Math.random() * 300) + 1500;
      
      setDiskData(prev => ({
        ...prev,
        usagePercent: newUsage,
        readSpeed: newReadSpeed,
        writeSpeed: newWriteSpeed
      }));

      setUsageHistory(prev => {
        const newPoint = {
          time: prev.length > 0 ? prev[prev.length - 1].time + 1 : 0,
          usage: newUsage
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
          <h2>{diskData.name}</h2>
          <span className={styles.model}>{diskData.type}</span>
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
                  <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFB900" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#FFB900" stopOpacity={0.2}/>
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
                  stroke="#FFB900" 
                  fillOpacity={1} 
                  fill="url(#colorDisk)" 
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className={styles.chartLabel}>디스크 활동</div>
          </div>
        </div>
        
        <div className={styles.detailsSection}>
          <div className={styles.detailColumn}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>이름:</span>
              <span className={styles.detailValue}>{diskData.name}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>타입:</span>
              <span className={styles.detailValue}>{diskData.type}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>읽기 속도:</span>
              <span className={styles.detailValue}>{diskData.readSpeed} MB/s</span>
            </div>
          </div>
          
          <div className={styles.detailColumn}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>쓰기 속도:</span>
              <span className={styles.detailValue}>{diskData.writeSpeed} MB/s</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>사용량:</span>
              <span className={styles.detailValue}>
                {(diskData.capacity - diskData.free).toFixed(1)}GB / {diskData.capacity}GB ({diskData.usagePercent}%)
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>남은 공간:</span>
              <span className={styles.detailValue}>{diskData.free}GB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiskMonitor;