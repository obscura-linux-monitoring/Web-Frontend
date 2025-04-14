import { useEffect, useState } from 'react';
import styles from '../../scss/node/NodeMetric.module.scss';

type NodeMetrics = {
  node_id: string;
  metrics: {
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    network_rx_bytes: number;
    network_tx_bytes: number;
  };
  last_update: string;
};

interface NodeMetricsProps {
  nodeId: string;
}

const NodeMetrics = ({ nodeId }: NodeMetricsProps) => {
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = new WebSocket(`ws://1.209.148.143:8000/influx/ws/metrics/${nodeId}`);

    socket.onopen = () => {
      console.log('📡 WebSocket 연결됨');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMetrics(data);
        setError(null);
        setLoading(false);
      } catch (err) {
        console.error('❌ WebSocket 메시지 파싱 실패:', err);
        setError('데이터 수신 오류');
      }
    };

    socket.onerror = (err) => {
      console.error('❌ WebSocket 에러:', err);
      setError('WebSocket 연결 실패');
    };

    socket.onclose = () => {
      console.log('🔌 WebSocket 연결 종료');
    };

    return () => {
      socket.close(); // cleanup
    };
  }, [nodeId]);

  if (loading) return <div className={styles.loading}>데이터 로딩 중...</div>;
  if (error) return <div className={styles.error}>{error}</div>;
  if (!metrics) return null;

  return (
    <div className={styles.metricsContainer}>
      <div className={styles.currentMetrics}>
        <h4>현재 상태</h4>
        <div className={styles.metricsGrid}>
          <div className={styles.metricItem}>
            <span className={styles.label}>CPU 사용률</span>
            <span className={styles.value}>{metrics.metrics.cpu_usage?.toFixed(2)}%</span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.label}>메모리 사용량</span>
            <span className={styles.value}>{metrics.metrics.memory_usage?.toFixed(2)}%</span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.label}>디스크 사용량</span>
            <span className={styles.value}>{metrics.metrics.disk_usage?.toFixed(2)}%</span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.label}>네트워크 수신</span>
            <span className={styles.value}>{formatBytes(metrics.metrics.network_rx_bytes)}/s</span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.label}>네트워크 송신</span>
            <span className={styles.value}>{formatBytes(metrics.metrics.network_tx_bytes)}/s</span>
          </div>
        </div>
        <div className={styles.lastUpdate}>
          마지막 업데이트: {new Date(metrics.last_update).toLocaleString()}
        </div>
      </div>
    </div>
  );
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export default NodeMetrics;
