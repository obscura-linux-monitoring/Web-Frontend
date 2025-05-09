import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/CpuMonitor.module.scss';

interface CpuData {
  name: string;
  model: string;
  usage: number;
  speed: string;
  baseSpeed: string;
  sockets: number;
  cores: number;
  logicalProcessors: number;
  virtualization: string;
  l1Cache: string;
  l2Cache: string;
  l3Cache: string;
  processes: number;
  threads: number;
  handles: number;
  uptime: string;
}

interface CpuUsagePoint {
  time: number;
  usage: number;
}

interface CpuMonitorProps {
  initialData?: CpuData;
  darkMode?: boolean;
}

const CpuMonitor: React.FC<CpuMonitorProps> = ({ 
  initialData,
  darkMode = true
}) => {
  // 더미 데이터 (실제로는 API 또는 WebSocket으로 가져올 수 있음)
  const defaultData: CpuData = {
    name: "CPU",
    model: "12th Gen Intel(R) Core(TM) i5-1240P",
    usage: 15,
    speed: "1.91GHz",
    baseSpeed: "1.70GHz",
    sockets: 1,
    cores: 12,
    logicalProcessors: 16,
    virtualization: "사용",
    l1Cache: "1.1MB",
    l2Cache: "9.0MB",
    l3Cache: "12.0MB",
    processes: 367,
    threads: 5781,
    handles: 169658,
    uptime: "4:16:33:58"
  };

  const [cpuData, setCpuData] = useState<CpuData>(initialData || defaultData);
  const [usageHistory, setUsageHistory] = useState<CpuUsagePoint[]>([]);
  const [maxPoints] = useState<number>(60); // 그래프에 표시할 최대 데이터 포인트 수

  // 실시간 CPU 데이터 시뮬레이션
  useEffect(() => {
    const interval = setInterval(() => {
      // 실제 구현에서는 여기서 API 호출하여 최신 CPU 데이터 가져옴
      const newUsage = Math.floor(Math.random() * 30) + 5; // 5% ~ 35% 범위의 가상 CPU 사용량
      
      setCpuData(prev => ({
        ...prev,
        usage: newUsage,
        speed: `${(1.7 + Math.random() * 0.5).toFixed(2)}GHz`
      }));

      setUsageHistory(prev => {
        const newPoint = {
          time: prev.length > 0 ? prev[prev.length - 1].time + 1 : 0,
          usage: newUsage
        };
        
        // 최대 포인트 수를 유지
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
    <div className={`${styles.cpuMonitorContainer} ${darkMode ? styles.darkMode : styles.lightMode}`}>
      <div className={styles.headerSection}>
        <div className={styles.title}>
          <h2>{cpuData.name}</h2>
          <span className={styles.model}>{cpuData.model}</span>
        </div>
      </div>
      
      <div className={styles.mainContent}>
        <div className={styles.sidebarInfo}>
          <div className={styles.resourceItem}>
            <div className={styles.miniGraph}>
              <div className={styles.cpuMiniGraph}></div>
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>CPU</span>
              <span className={styles.resourceValue}>{cpuData.usage}% {cpuData.speed}</span>
            </div>
          </div>
          
          <div className={styles.resourceItem}>
            <div className={styles.miniGraph}>
              <div className={styles.memoryMiniGraph}></div>
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>메모리</span>
              <span className={styles.resourceValue}>6.8/7.6GB (89%)</span>
            </div>
          </div>
          
          <div className={styles.resourceItem}>
            <div className={styles.miniGraph}>
              <div className={styles.diskMiniGraph}></div>
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>디스크 0(C:)</span>
              <span className={styles.resourceValue}>SSD(NVMe) 2%</span>
            </div>
          </div>
          
          <div className={styles.resourceItem}>
            <div className={styles.miniGraph}>
              <div className={styles.diskMiniGraph}></div>
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>디스크 1(D:)</span>
              <span className={styles.resourceValue}>SSD(NVMe) 1%</span>
            </div>
          </div>
          
          <div className={styles.resourceItem}>
            <div className={styles.miniGraph}>
              <div className={styles.networkMiniGraph}></div>
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>Wi-Fi</span>
              <span className={styles.resourceValue}>S: 0 R: 0 Kbps</span>
            </div>
          </div>
        </div>
        
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
                <span className={styles.detailValue}>{cpuData.usage}%</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>속도</span>
                <span className={styles.detailValue}>{cpuData.speed}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>프로세스</span>
                <span className={styles.detailValue}>{cpuData.processes}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>스레드</span>
                <span className={styles.detailValue}>{cpuData.threads}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>핸들</span>
                <span className={styles.detailValue}>{cpuData.handles}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>작동 시간</span>
                <span className={styles.detailValue}>{cpuData.uptime}</span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>기본 속도:</span>
                <span className={styles.detailValue}>{cpuData.baseSpeed}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>소켓:</span>
                <span className={styles.detailValue}>{cpuData.sockets}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>코어:</span>
                <span className={styles.detailValue}>{cpuData.cores}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>논리 프로세서:</span>
                <span className={styles.detailValue}>{cpuData.logicalProcessors}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>가상화:</span>
                <span className={styles.detailValue}>{cpuData.virtualization}</span>
              </div>
            </div>
            
            <div className={styles.detailColumn}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>L1 캐시:</span>
                <span className={styles.detailValue}>{cpuData.l1Cache}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>L2 캐시:</span>
                <span className={styles.detailValue}>{cpuData.l2Cache}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>L3 캐시:</span>
                <span className={styles.detailValue}>{cpuData.l3Cache}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CpuMonitor;