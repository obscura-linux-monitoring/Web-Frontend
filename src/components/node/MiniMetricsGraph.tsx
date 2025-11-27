// src/components/node/MiniMetricsGraph.tsx
import React, { useEffect, useState, useRef } from 'react';
import { useNodeContext } from '../../context/NodeContext';
import { useAuthContext } from '../../context/AuthContext';
import styles from '../../scss/node/MiniMetricsGraph.module.scss';
import '../../scss/node/node_mobile/MiniMetricsGraph.module.mobile.scss';

type DataPoint = {
  value: number;
  timestamp: number;
};

type MetricData = {
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
};

interface MiniMetricsGraphProps {
  nodeId?: string;
}

const MAX_DATA_POINTS = 15; // 표시할 데이터 포인트 수

const MiniMetricsGraph: React.FC<MiniMetricsGraphProps> = ({ nodeId: propsNodeId }) => {
  const { selectedNode, monitoringEnabled } = useNodeContext();
  const { isAuthenticated } = useAuthContext();
  const [cpuData, setCpuData] = useState<DataPoint[]>([]);
  const [memoryData, setMemoryData] = useState<DataPoint[]>([]);
  const [cpuAlert, setCpuAlert] = useState<boolean>(false);
  const [memoryAlert, setMemoryAlert] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // props로 받은 nodeId 우선, 없으면 context에서 가져오기
  const currentNodeId = propsNodeId || selectedNode?.node_id;

  // 인증 상태 변화 감지 - 로그아웃 시 WebSocket 정리
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('MiniMetricsGraph: 로그아웃 감지, WebSocket 정리');
      
      // WebSocket 연결 해제
      if (socketRef.current) {
        socketRef.current.close(1000, "User logged out");
        socketRef.current = null;
      }
      
      // 재연결 타이머 해제
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // 데이터 초기화
      setCpuData([]);
      setMemoryData([]);
      setCpuAlert(false);
      setMemoryAlert(false);
    }
  }, [isAuthenticated]);

  // WebSocket 연결 관리
  useEffect(() => {
    if (!currentNodeId || !monitoringEnabled) {
      // 연결 종료
      if (socketRef.current) {
        socketRef.current.close(1000, "모니터링 비활성화 또는 노드 선택 안됨");
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // 데이터 초기화
      setCpuData([]);
      setMemoryData([]);
      setCpuAlert(false);
      setMemoryAlert(false);
      return;
    }
    
    // 웹소켓 연결 함수
    const connectWebSocket = () => {
      // 이미 연결된 소켓이 있으면 닫기
      if (socketRef.current) {
        socketRef.current.close();
      }
      
      const socket = new WebSocket(`ws://1.209.148.143:8000/influx/ws/metrics/${currentNodeId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('📡 MiniMetricsGraph WebSocket 연결됨:', currentNodeId);
        // 재연결 타임아웃이 설정되어 있으면 제거
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { cpu_usage, memory_usage } = data.metrics;
          
          // 데이터 유효성 검사
          const validCpuUsage = typeof cpu_usage === 'number' && !isNaN(cpu_usage) ? cpu_usage : 0;
          const validMemoryUsage = typeof memory_usage === 'number' && !isNaN(memory_usage) ? memory_usage : 0;
          
          const now = Date.now();

          // CPU 데이터 업데이트
          setCpuData(prev => {
            const newData = [...prev, { value: validCpuUsage, timestamp: now }];
            return newData.length > MAX_DATA_POINTS ? newData.slice(-MAX_DATA_POINTS) : newData;
          });

          // 메모리 데이터 업데이트
          setMemoryData(prev => {
            const newData = [...prev, { value: validMemoryUsage, timestamp: now }];
            return newData.length > MAX_DATA_POINTS ? newData.slice(-MAX_DATA_POINTS) : newData;
          });

          // 알림 설정 (CPU 80% 이상, 메모리 90% 이상시 경고)
          setCpuAlert(validCpuUsage >= 80);
          setMemoryAlert(validMemoryUsage >= 90);
          
        } catch (err) {
          console.error('❌ MiniMetricsGraph WebSocket 메시지 파싱 실패:', err);
        }
      };

      socket.onerror = (err) => {
        console.error('❌ MiniMetricsGraph WebSocket 에러:', err);
      };

      socket.onclose = (event) => {
        console.log('🔌 MiniMetricsGraph WebSocket 연결 종료');
        
        // 모니터링이 활성화되어 있고 비정상적인 종료일 경우에만 자동 재연결 시도
        if (monitoringEnabled && currentNodeId && event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, 3000); // 3초 후 재연결
        }
      };
    };

    connectWebSocket();

    // cleanup 함수
    return () => {
      if (socketRef.current) {
        socketRef.current.close(1000, "Component unmounted");
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [currentNodeId, monitoringEnabled]);

  // 그래프 데이터가 없으면 기본 UI 표시
  if (cpuData.length === 0 || memoryData.length === 0) {
    return (
      <div className={styles.miniMetricsContainer}>
        <div className={styles.metricItem}>
          <span className={styles.label}>CPU</span>
          <div className={styles.placeholderGraph}></div>
          <span className={styles.value}>--.-%</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.label}>MEM</span>
          <div className={styles.placeholderGraph}></div>
          <span className={styles.value}>--.-%</span>
        </div>
      </div>
    );
  }

  // SVG 경로 생성 함수 - NaN 처리 개선
  const createSvgPath = (data: DataPoint[], maxValue: number) => {
    if (data.length === 0) return '';
    
    // 데이터 유효성 재검사
    const validData = data.filter(point => 
      typeof point.value === 'number' && 
      !isNaN(point.value) && 
      isFinite(point.value)
    );
    
    if (validData.length === 0) return '';
    
    const width = 60; // 그래프 너비
    const height = 20; // 그래프 높이
    const safeMaxValue = maxValue > 0 ? maxValue : 100; // maxValue가 0이면 기본값 100 사용
    
    // 데이터가 1개만 있는 경우 처리
    if (validData.length === 1) {
      const y = height - (validData[0].value / safeMaxValue) * height;
      const safeY = isNaN(y) || !isFinite(y) ? height / 2 : y;
      return `M0,${safeY} L${width},${safeY}`;
    }
    
    const points = validData.map((point, index) => {
      const x = (index / (validData.length - 1)) * width;
      const y = height - (point.value / safeMaxValue) * height;
      
      // NaN 체크 및 안전한 값으로 대체
      const safeX = isNaN(x) || !isFinite(x) ? index * 10 : x;
      const safeY = isNaN(y) || !isFinite(y) ? height / 2 : y;
      
      return `${safeX},${safeY}`;
    });

    return `M${points.join(' L')}`;
  };

  // 모니터링이 비활성화 되었거나 노드가 선택되지 않았다면 표시하지 않음
  if (!monitoringEnabled || !currentNodeId) {
    return null;
  }

  // 안전한 값 표시를 위한 헬퍼 함수
  const getSafeValue = (data: DataPoint[]) => {
    if (data.length === 0) return '--.-';
    const lastValue = data[data.length - 1].value;
    return typeof lastValue === 'number' && !isNaN(lastValue) && isFinite(lastValue) 
      ? lastValue.toFixed(1) 
      : '--.-';
  };

  return (
    <div className={styles.miniMetricsContainer}>
      <div className={`${styles.metricItem} ${cpuAlert ? styles.alert : ''}`}>
        <span className={styles.label}>CPU</span>
        <svg width="60" height="20" className={styles.sparkline}>
          <path
            d={createSvgPath(cpuData, 100)}
            className={`${styles.sparklinePath} ${styles.cpuPath}`}
            fill="none"
          />
        </svg>
        <span className={styles.value}>{getSafeValue(cpuData)}%</span>
      </div>
      
      <div className={`${styles.metricItem} ${memoryAlert ? styles.alert : ''}`}>
        <span className={styles.label}>MEM</span>
        <svg width="60" height="20" className={styles.sparkline}>
          <path
            d={createSvgPath(memoryData, 100)}
            className={`${styles.sparklinePath} ${styles.memoryPath}`}
            fill="none"
          />
        </svg>
        <span className={styles.value}>{getSafeValue(memoryData)}%</span>
      </div>
    </div>
  );
};

export default MiniMetricsGraph;