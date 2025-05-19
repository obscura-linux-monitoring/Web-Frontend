import React, { useState, useEffect } from 'react';
import styles from '../../scss/performance/PerformanceView.module.scss';
import CpuMonitor from './CpuMonitor';
import MemoryMonitor from './MemoryMonitor';
import DiskMonitor from './DiskMonitor';
import NetworkMonitor from './NetworkMonitor';

// 리소스 타입 정의
type ResourceType = 'cpu' | 'memory' | 'disk0' | 'disk1' | 'network';

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

const PerformanceView: React.FC<CpuMonitorProps> = ({ 
  initialData,
  darkMode = true
}) => {
  // 선택된 리소스 타입 상태 추가
  const [selectedResource, setSelectedResource] = useState<ResourceType>('cpu');
  
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

  // 실시간 CPU 데이터 시뮬레이션 (CPU가 선택되었을 때만 실행)
  useEffect(() => {
    if (selectedResource !== 'cpu') return;
    
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
  }, [maxPoints, selectedResource]);
  
  // 리소스 항목 클릭 핸들러
  const handleResourceClick = (resourceType: ResourceType) => {
    setSelectedResource(resourceType);
  };

  // 선택된 리소스에 따라 적절한 컴포넌트 렌더링
  const renderResourceMonitor = () => {
    const nodeId = window.location.pathname.split('/').pop() || undefined;
    
    switch (selectedResource) {
      case 'cpu':
        return <CpuMonitor nodeId={nodeId} />;
      case 'memory':
        return <MemoryMonitor />;
      case 'disk0':
        return <DiskMonitor />;
      case 'disk1':
        return <DiskMonitor />;
      case 'network':
        return <NetworkMonitor />;
      default:
        return <CpuMonitor nodeId={nodeId} />;
    }
  };

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
          {/* CPU 리소스 항목 */}
          <div 
            className={`${styles.resourceItem} ${selectedResource === 'cpu' ? styles.selected : ''}`}
            onClick={() => handleResourceClick('cpu')}
          >
            <div className={styles.miniGraph}>
              <div className={styles.cpuMiniGraph}></div>
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>CPU</span>
              <span className={styles.resourceValue}>{cpuData.usage}% {cpuData.speed}</span>
            </div>
          </div>
          
          {/* 메모리 리소스 항목 */}
          <div 
            className={`${styles.resourceItem} ${selectedResource === 'memory' ? styles.selected : ''}`}
            onClick={() => handleResourceClick('memory')}
          >
            <div className={styles.miniGraph}>
              <div className={styles.memoryMiniGraph}></div>
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>메모리</span>
              <span className={styles.resourceValue}>6.8/7.6GB (89%)</span>
            </div>
          </div>
          
          {/* 디스크 0 리소스 항목 */}
          <div 
            className={`${styles.resourceItem} ${selectedResource === 'disk0' ? styles.selected : ''}`}
            onClick={() => handleResourceClick('disk0')}
          >
            <div className={styles.miniGraph}>
              <div className={styles.diskMiniGraph}></div>
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>디스크 0(C:)</span>
              <span className={styles.resourceValue}>SSD(NVMe) 2%</span>
            </div>
          </div>
          
          {/* 디스크 1 리소스 항목 */}
          <div 
            className={`${styles.resourceItem} ${selectedResource === 'disk1' ? styles.selected : ''}`}
            onClick={() => handleResourceClick('disk1')}
          >
            <div className={styles.miniGraph}>
              <div className={styles.diskMiniGraph}></div>
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>디스크 1(D:)</span>
              <span className={styles.resourceValue}>SSD(NVMe) 1%</span>
            </div>
          </div>
          
          {/* 네트워크 리소스 항목 */}
          <div 
            className={`${styles.resourceItem} ${selectedResource === 'network' ? styles.selected : ''}`}
            onClick={() => handleResourceClick('network')}
          >
            <div className={styles.miniGraph}>
              <div className={styles.networkMiniGraph}></div>
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>Wi-Fi</span>
              <span className={styles.resourceValue}>S: 0 R: 0 Kbps</span>
            </div>
          </div>
        </div>
        
        {/* 선택된 리소스에 따라 해당 모니터링 컴포넌트 렌더링 */}
        <div className={styles.monitorContainer}>
          {renderResourceMonitor()}
        </div>
      </div>
    </div>
  );
};

export default PerformanceView;