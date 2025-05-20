import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../api'; // axios 인스턴스 import
import styles from '../../scss/performance/PerformanceView.module.scss';
import CpuMonitor from './CpuMonitor';
import MemoryMonitor from './MemoryMonitor';
import DiskMonitor from './DiskMonitor';
import NetworkMonitor from './NetworkMonitor';
import MiniPerformanceGraph from './MiniPerformanceGraph';

// 리소스 타입 정의 - 허용되는 리소스 타입을 명시적으로 지정
type ResourceType = 'cpu' | 'memory' | 'network' | `disk${number}`;

// 디스크 정보 인터페이스
interface DiskInfo {
  id: number;
  name: string;
  device: string;
  model?: string;
  type?: string;
  usage_percent?: number;
  total_gb?: number;
}

interface PerformanceViewProps {
  darkMode?: boolean;
}

const PerformanceView: React.FC<PerformanceViewProps> = ({ 
  darkMode = true
}) => {
  // 선택된 리소스 타입 상태
  const [selectedResource, setSelectedResource] = useState<ResourceType>('cpu');
  // 디스크 목록 상태 추가
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  // 로딩 상태 추가
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // 에러 상태 추가
  const [error, setError] = useState<string | null>(null);
  // 리소스 전환 중인지 상태 추가
  const [transitioning, setTransitioning] = useState<boolean>(false);
  
  // 현재 활성화된 디스크 추적
  const activeDiskRef = useRef<string | null>(null);
  
  // 컴포넌트 마운트 시 디스크 목록 가져오기
  useEffect(() => {
    const fetchDisks = async () => {
      try {
        setIsLoading(true);
        
        // URL에서 nodeId 가져오기
        const nodeId = window.location.pathname.split('/').pop();
        
        if (!nodeId) {
          throw new Error('노드 ID를 찾을 수 없습니다.');
        }
        
        // api 인스턴스를 사용하여 디스크 정보 가져오기
        const response = await api.get(`/performance/disk_list/${nodeId}`);
        
        if (response.data && Array.isArray(response.data.disks)) {
          setDisks(response.data.disks);
        } else {
          // 응답 형식이 예상과 다른 경우 빈 디스크 배열 설정
          setDisks([]);
          console.warn('디스크 정보 형식이 예상과 다릅니다:', response.data);
        }
        
        setError(null);
      } catch (err) {
        console.error('디스크 정보 가져오기 실패:', err);
        setError('디스크 정보를 불러올 수 없습니다.');
        
        // 오류 발생 시 기본 디스크 목록 사용
        setDisks([
          { id: 0, name: '디스크 0', device: '/dev/sda' },
          { id: 1, name: '디스크 1', device: '/dev/sdb' }
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDisks();
  }, []);
  
  // useMemo를 사용해 디스크 컴포넌트를 미리 생성하고 캐싱
  const diskMonitors = useMemo(() => {
  // 각 디스크별로 DiskMonitor 컴포넌트를 생성하여 맵으로 관리
    const monitors: Record<string, React.ReactNode> = {};
    
    disks.forEach(disk => {
      const resourceKey = `disk${disk.id}` as const;
      // 디스크 장치가 있을 때만 추가
      if (disk.device) {
        // 컴포넌트 자체를 저장하지 않고 장치 정보만 저장
        monitors[resourceKey] = disk.device;
      }
    });
    
    return monitors;
  }, [disks]); // 디스크 목록이 변경될 때만 재계산
  
  // 기본 모니터 컴포넌트 매핑
  const baseMonitors = useMemo(() => ({
    cpu: <CpuMonitor />,
    memory: <MemoryMonitor />,
    network: <NetworkMonitor />
  }), []); // 의존성 없음 - 컴포넌트가 마운트될 때 한 번만 생성

  // 렌더링 함수 수정
  const renderResourceMonitor = () => {
    // 전환 중이면 로딩 화면 표시
    if (transitioning) {
      return (
        <div className={styles.transitioningState}>
          <div className={styles.loadingSpinner}></div>
          <div>리소스 전환 중...</div>
        </div>
      );
    }
    
    // CPU, 메모리, 네트워크 등 기본 리소스 렌더링
    if (selectedResource === 'cpu' || selectedResource === 'memory' || selectedResource === 'network') {
      return baseMonitors[selectedResource];
    }
    
    // 디스크 리소스 렌더링
    if (selectedResource.startsWith('disk')) {
      // 캐시된 디스크 장치명이 있으면 새 컴포넌트 생성
      const devicePath = diskMonitors[selectedResource];
      
      if (devicePath && typeof devicePath === 'string') {
        // 명확한 key 속성 부여
        return (
          <DiskMonitor 
            key={`disk-${devicePath}`}
            device={devicePath}
          />
        );
      }
      
      // 캐시에 없으면 디스크 ID로 검색
      const diskId = selectedResource.replace('disk', '');
      const selectedDisk = disks.find(disk => disk.id.toString() === diskId);
      
      if (selectedDisk?.device) {
        return (
          <DiskMonitor 
            key={`disk-${selectedDisk.device}`}
            device={selectedDisk.device}
          />
        );
      }
      
      // 디스크 장치명을 찾을 수 없는 경우 오류 표시
      return (
        <div className={styles.errorState}>
          디스크 장치명을 찾을 수 없습니다. (ID: {diskId})
        </div>
      );
    }
    
    // 기본값으로 CPU 모니터 반환
    return baseMonitors['cpu'];
  };

  // 리소스 항목 클릭 핸들러 - 디스크 전환 시 지연 시간 증가
  const handleResourceClick = (resourceType: ResourceType) => {
    // 이미 선택된 것과 같은 리소스면 아무것도 하지 않음
    if (selectedResource === resourceType || transitioning) return;
    
    // 디스크 간 전환 시 특별 처리
    if (selectedResource.startsWith('disk') && resourceType.startsWith('disk')) {
      // 전환 중 상태로 설정
      setTransitioning(true);
      
      // 현재 활성 디스크 추적
      activeDiskRef.current = resourceType;
      
      // 지연 후 리소스 변경
      setTimeout(() => {
        // 중간에 다른 리소스로 변경되지 않았는지 확인
        if (activeDiskRef.current === resourceType) {
          setSelectedResource(resourceType);
          
          // 추가 지연 후 전환 상태 해제 (디스크 모니터가 마운트된 후)
          setTimeout(() => {
            setTransitioning(false);
          }, 400); // 증가된 지연 시간
        } else {
          setTransitioning(false);
        }
      }, 300); // 증가된 지연 시간
    } else {
      // 디스크 <-> 다른 리소스 간 전환도 약간의 전환 효과 추가
      setTransitioning(true);
      
      // 현재 활성 리소스 추적
      activeDiskRef.current = resourceType;
      
      // 짧은 지연 후 리소스 변경
      setTimeout(() => {
        setSelectedResource(resourceType);
        setTransitioning(false);
      }, 200);
    }
  };

  return (
    <div className={`${styles.cpuMonitorContainer} ${darkMode ? styles.darkMode : styles.lightMode}`}>
      <div className={styles.headerSection}>
        <div className={styles.title}>
          <h2>성능 모니터링</h2>
          <span className={styles.model}>
            {selectedResource === 'cpu' ? 'CPU' : 
             selectedResource === 'memory' ? '메모리' : 
             selectedResource === 'network' ? '네트워크' :
             // 디스크인 경우 해당 디스크 이름 표시
             selectedResource.startsWith('disk') ? 
               disks.find(d => `disk${d.id}` === selectedResource)?.name || selectedResource :
               selectedResource}
          </span>
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
              <MiniPerformanceGraph type="cpu" color="#1E88E5" />
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>CPU</span>
              <span className={styles.resourceValue}>로딩 중...</span>
            </div>
          </div>
          
          {/* 메모리 리소스 항목 */}
          <div 
            className={`${styles.resourceItem} ${selectedResource === 'memory' ? styles.selected : ''}`}
            onClick={() => handleResourceClick('memory')}
          >
            <div className={styles.miniGraph}>
              <MiniPerformanceGraph type="memory" color="#8E24AA" />
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>메모리</span>
              <span className={styles.resourceValue}>로딩 중...</span>
            </div>
          </div>
          
          {/* 디스크 항목들 - 동적으로 생성 */}
          {isLoading ? (
            <div className={styles.loadingDisks}>디스크 정보 로딩 중...</div>
          ) : (
            disks.length > 0 ? (
              disks.map((disk, index) => (
                <div 
                  key={`disk-item-${disk.id}`}
                  className={`${styles.resourceItem} ${selectedResource === `disk${disk.id}` ? styles.selected : ''}`}
                  onClick={() => handleResourceClick(`disk${disk.id}`)}
                >
                  <div className={styles.miniGraph}>
                    <MiniPerformanceGraph 
                      type="disk" 
                      resourceId={disk.id.toString()} 
                      color={index % 2 === 0 ? "#4CAF50" : "#FB8C00"} 
                    />
                  </div>
                  <div className={styles.resourceDetails}>
                    <span className={styles.resourceName}>{disk.name}</span>
                    <span className={styles.resourceValue}>
                      {disk.device?.split('/').pop() || disk.device}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyDisks}>
                디스크 정보가 없습니다.
              </div>
            )
          )}
          
          {/* 네트워크 리소스 항목 */}
          <div 
            className={`${styles.resourceItem} ${selectedResource === 'network' ? styles.selected : ''}`}
            onClick={() => handleResourceClick('network')}
          >
            <div className={styles.miniGraph}>
              <MiniPerformanceGraph type="network" color="#039BE5" />
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>네트워크</span>
              <span className={styles.resourceValue}>로딩 중...</span>
            </div>
          </div>
        </div>
        
        {/* 선택된 리소스에 따라 해당 모니터링 컴포넌트 렌더링 */}
        <div className={styles.monitorContainer}>
          {/* 전환 상태를 표시하기 위한 wraper div */}
          <div className={styles.monitorWrapper} style={{ opacity: transitioning ? 0.5 : 1 }}>
            {renderResourceMonitor()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceView;