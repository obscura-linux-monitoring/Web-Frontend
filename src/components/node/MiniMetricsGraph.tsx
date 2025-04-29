// src/components/node/MiniMetricsGraph.tsx
import React, { useEffect, useState, useRef } from 'react';
import { useNodeContext } from '../../context/NodeContext';
import styles from '../../scss/node/MiniMetricsGraph.module.scss';

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

const MAX_DATA_POINTS = 15; // 표시할 데이터 포인트 수

const MiniMetricsGraph: React.FC = () => {
  const { selectedNode, monitoringEnabled } = useNodeContext();
  const [cpuData, setCpuData] = useState<DataPoint[]>([]);
  const [memoryData, setMemoryData] = useState<DataPoint[]>([]);
  const [cpuAlert, setCpuAlert] = useState<boolean>(false);
  const [memoryAlert, setMemoryAlert] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // WebSocket 연결 관리
  useEffect(() => {
    if (!selectedNode?.node_id || !monitoringEnabled) {
      // 연결 종료
      if (socketRef.current) {
        socketRef.current.close(1000, "모니터링 비활성화 또는 노드 선택 안됨");
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }
    
    const nodeId = selectedNode.node_id;
    
    // 웹소켓 연결 함수
    const connectWebSocket = () => {
      // 이미 연결된 소켓이 있으면 닫기
      if (socketRef.current) {
        socketRef.current.close();
      }
      
      const socket = new WebSocket(`ws://1.209.148.143:8000/influx/ws/metrics/${nodeId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('📡 MiniMetricsGraph WebSocket 연결됨');
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
          const now = Date.now();

          // CPU 데이터 업데이트
          setCpuData(prev => {
            const newData = [...prev, { value: cpu_usage, timestamp: now }];
            return newData.length > MAX_DATA_POINTS ? newData.slice(-MAX_DATA_POINTS) : newData;
          });

          // 메모리 데이터 업데이트
          setMemoryData(prev => {
            const newData = [...prev, { value: memory_usage, timestamp: now }];
            return newData.length > MAX_DATA_POINTS ? newData.slice(-MAX_DATA_POINTS) : newData;
          });

          // 알림 설정 (CPU 80% 이상, 메모리 90% 이상시 경고)
          setCpuAlert(cpu_usage >= 80);
          setMemoryAlert(memory_usage >= 90);
          
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
        if (monitoringEnabled && selectedNode?.node_id && event.code !== 1000) {
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
  }, [selectedNode?.node_id, monitoringEnabled]);

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

  // SVG 경로 생성 함수
  const createSvgPath = (data: DataPoint[], maxValue: number) => {
    if (data.length === 0) return '';

    const width = 60; // 그래프 너비
    const height = 20; // 그래프 높이
    
    const points = data.map((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - (point.value / maxValue) * height;
      return `${x},${y}`;
    });

    return `M${points.join(' L')}`;
  };

  // 모니터링이 비활성화 되었거나 노드가 선택되지 않았다면 표시하지 않음
  if (!monitoringEnabled || !selectedNode) {
    return null;
  }

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
        <span className={styles.value}>{cpuData[cpuData.length - 1].value.toFixed(1)}%</span>
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
        <span className={styles.value}>{memoryData[memoryData.length - 1].value.toFixed(1)}%</span>
      </div>
    </div>
  );
};

export default MiniMetricsGraph;