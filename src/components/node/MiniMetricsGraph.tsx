// src/components/node/MiniMetricsGraph.tsx
import React, { useEffect, useState } from 'react';
import { useNodeContext } from '../../context/NodeContext';
import styles from '../../scss/node/MiniMetricsGraph.module.scss';

type DataPoint = {
  value: number;
  timestamp: number;
};

const MAX_DATA_POINTS = 30; // 표시할 데이터 포인트 수

const MiniMetricsGraph: React.FC = () => {
  const { selectedNode, nodeMetrics } = useNodeContext();
  const [cpuData, setCpuData] = useState<DataPoint[]>([]);
  const [memoryData, setMemoryData] = useState<DataPoint[]>([]);
  const [cpuAlert, setCpuAlert] = useState<boolean>(false);
  const [memoryAlert, setMemoryAlert] = useState<boolean>(false);

  // 확인용 디버깅 로그 추가
  useEffect(() => {
    console.log("MiniMetricsGraph rendered", { nodeMetrics, selectedNode });
  }, []);

  // 새 메트릭이 들어올 때마다 데이터 업데이트
  useEffect(() => {
    if (!nodeMetrics || !nodeMetrics.metrics) {
      console.log("No metrics data available");
      return;
    }

    console.log("Updating metrics data", nodeMetrics.metrics);
    const now = Date.now();
    const { cpu_usage, memory_usage } = nodeMetrics.metrics;

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
  }, [nodeMetrics]);

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