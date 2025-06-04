import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import api from '../../api'; // axios 인스턴스 import
import styles from '../../scss/performance/PerformanceView.module.scss';
import CpuMonitor from './CpuMonitor';
import MemoryMonitor from './MemoryMonitor';
import DiskMonitor from './DiskMonitor';
import NetworkMonitor from './NetworkMonitor';
import MiniPerformanceGraph from './MiniPerformanceGraph';
import WiFiMonitor from './WiFiMonitor';
import EthernetMonitor from './EthernetMonitor';

// 리소스 타입 정의
type ResourceType = 'cpu' | 'memory' | 'disk' | 'network' | 'wifi' | 'ethernet' | string;

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
  // 디스크 목록 상태
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  // 로딩 상태
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // 에러 상태
  const [error, setError] = useState<string | null>(null);
  // 리소스 전환 중인지 상태
  const [transitioning, setTransitioning] = useState<boolean>(false);
  
  // 현재 선택된 디스크 정보
  const [selectedDiskDevice, setSelectedDiskDevice] = useState<string>('');
  
  // 전환 타이머 참조 저장용
  const transitionTimerRef = useRef<number | null>(null);
  
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
          
          // 첫 번째 디스크 장치명 저장 (초기값)
          if (response.data.disks.length > 0 && response.data.disks[0].device) {
            setSelectedDiskDevice(response.data.disks[0].device);
          }
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
        const defaultDisks = [
          { id: 0, name: '디스크 0', device: '/dev/sda' },
          { id: 1, name: '디스크 1', device: '/dev/sdb' }
        ];
        setDisks(defaultDisks);
        
        // 기본 디스크 장치명 저장
        setSelectedDiskDevice('/dev/sda');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDisks();
    
    // 컴포넌트 언마운트 시 타이머 정리
    return () => {
      if (transitionTimerRef.current !== null) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, []);
  
  // 디스크 ID로 장치명 조회하는 함수 - 메모이제이션
  const getDiskDeviceById = useCallback((diskId: string): string => {
    const disk = disks.find(d => d.id.toString() === diskId);
    return disk?.device || '';
  }, [disks]);
  
  // 리소스 아이템 클릭 핸들러 - useCallback으로 최적화
  const handleResourceClick = useCallback((resourceType: ResourceType) => {
    // 이미 선택된 것과 같은 리소스면 아무것도 하지 않음
    if (selectedResource === resourceType || transitioning) return;
    
    // 전환 중 상태로 설정
    setTransitioning(true);
    
    // 기존 전환 타이머가 있다면 정리
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    
    // 디스크 리소스인 경우 디스크 장치명 먼저 업데이트
    if (resourceType.startsWith('disk')) {
      const diskId = resourceType.replace('disk', '');
      const devicePath = getDiskDeviceById(diskId);
      
      if (devicePath) {
        console.log(`디스크 장치 변경: ${selectedDiskDevice} -> ${devicePath}`);
        setSelectedDiskDevice(devicePath);
      }
    }
    
    // 지연 후 리소스 변경 (모든 리소스 타입에 동일한 지연 적용)
    transitionTimerRef.current = window.setTimeout(() => {
      setSelectedResource(resourceType);
      
      // 추가 지연 후 전환 상태 해제
      transitionTimerRef.current = window.setTimeout(() => {
        setTransitioning(false);
        transitionTimerRef.current = null;
      }, 400); // 지연 시간 증가
    }, 200); // 지연 시간 증가
  }, [selectedResource, transitioning, getDiskDeviceById, selectedDiskDevice]);
  
  // 메인 컨텐츠 렌더링 - useMemo로 최적화
  const mainContent = useMemo(() => {
    // 전환 중이면 로딩 화면 표시
    if (transitioning) {
      return (
        <div className={styles.transitioningState}>
          <div className={styles.loadingSpinner}></div>
          <div>리소스 전환 중...</div>
        </div>
      );
    }

    // 기본 리소스 표시 (CPU, 메모리, 네트워크)
    if (selectedResource === 'cpu') {
      return <CpuMonitor key="cpu-monitor" />;
    }
    
    if (selectedResource === 'memory') {
      return <MemoryMonitor key="memory-monitor" />;
    }
    
    if (selectedResource === 'network') {
      return <NetworkMonitor key="network-monitor" />;
    }

    if (selectedResource === 'wifi') {
      return <WiFiMonitor key="wifi-monitor" />;
    }

    if (selectedResource === 'ethernet') {
      return <EthernetMonitor key="ethernet" />;
    }
    
    // 디스크 리소스 표시 - 단일 DiskMonitor 인스턴스 사용
    if (selectedResource.startsWith('disk') && selectedDiskDevice) {
      return (
        <DiskMonitor 
          key={`disk-monitor-${selectedDiskDevice}`} // 디바이스별 고유 키 사용
          device={selectedDiskDevice} 
        />
      );
    }
    
    // 기본값으로 CPU 모니터 반환
    return <CpuMonitor key="cpu-monitor-default" />;
  }, [selectedResource, selectedDiskDevice, transitioning]);

  // 선택된 리소스의 이름 계산 - useMemo로 최적화
  const selectedResourceName = useMemo(() => {
    if (selectedResource === 'cpu') return 'CPU';
    if (selectedResource === 'memory') return '메모리';
    if (selectedResource === 'network') return '네트워크';
    if (selectedResource === 'wifi') return 'Wi-Fi';
    if (selectedResource === 'ethernet') return 'ethernet';
    
    // 디스크인 경우 해당 디스크 이름 표시
    if (selectedResource.startsWith('disk')) {
      const disk = disks.find(d => `disk${d.id}` === selectedResource);
      return disk?.name || '디스크';
    }
    
    return selectedResource;
  }, [selectedResource, disks]);

  // 디스크 항목 렌더링 - useMemo로 최적화
  const diskItems = useMemo(() => {
    if (isLoading) {
      return <div className={styles.loadingDisks}>디스크 정보 로딩 중...</div>;
    }
    
    if (disks.length === 0) {
      return <div className={styles.emptyDisks}>디스크 정보가 없습니다.</div>;
    }
    
    return disks.map((disk, index) => (
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
    ));
  }, [disks, isLoading, selectedResource, handleResourceClick]);

  return (
    <div className={`${styles.cpuMonitorContainer} ${darkMode ? styles.darkMode : styles.lightMode}`}>
      <div className={styles.headerSection}>
        <div className={styles.title}>
          <h2>성능 모니터링</h2>
          <span className={styles.model}>{selectedResourceName}</span>
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
          {diskItems}
          
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
          
          {/* WiFi 리소스 항목 추가 */}
          <div 
            className={`${styles.resourceItem} ${selectedResource === 'wifi' ? styles.selected : ''}`}
            onClick={() => handleResourceClick('wifi')}
          >
            <div className={styles.miniGraph}>
              <MiniPerformanceGraph type="wifi" color="#E91E63" />
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>Wi-Fi</span>
              <span className={styles.resourceValue}>로딩 중...</span>
            </div>
          </div>

          {/* Ethernet 리소스 항목 추가 */}
          <div 
            className={`${styles.resourceItem} ${selectedResource === 'ethernet' ? styles.selected : ''}`}
            onClick={() => handleResourceClick('ethernet')}
          >
            <div className={styles.miniGraph}>
              <MiniPerformanceGraph type="ethernet" color="#E91E63" />
            </div>
            <div className={styles.resourceDetails}>
              <span className={styles.resourceName}>이더넷</span>
              <span className={styles.resourceValue}>로딩 중...</span>
            </div>
          </div>
        </div>
        
        
        {/* 선택된 리소스에 따라 해당 모니터링 컴포넌트 렌더링 */}
        <div className={styles.monitorContainer}>
          {mainContent}
        </div>
      </div>
    </div>
  );
};

export default React.memo(PerformanceView);