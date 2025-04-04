import { useEffect, useState } from 'react';
import api from '../api';
import styles from '../scss/NodeMetric.module.scss';

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

type MetricsHistory = {
  node_id: string;
  field: string;
  history: {
    time: string;
    value: number;
  }[];
};

interface NodeMetricsProps {
  nodeId: string;
}

const NodeMetrics = ({ nodeId }: NodeMetricsProps) => {
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNodeMetrics = async () => {
    try {
      const [metricsResponse, historyResponse] = await Promise.all([
        api.get(`/influx/node/metrics/${nodeId}`),
        api.get(`/influx/node/history/${nodeId}`, {
          params: {
            field: 'cpu_usage',
            start: '-1h'
          }
        })
      ]);

      setMetrics(metricsResponse.data);
      setMetricsHistory(historyResponse.data);
      setError(null);
    } catch (error) {
      console.error('❌ 메트릭 데이터 조회 실패:', error);
      setError('메트릭 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodeMetrics();
    // 1분마다 데이터 갱신
    const interval = setInterval(fetchNodeMetrics, 60000);
    return () => clearInterval(interval);
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
            <span className={styles.value}>{formatBytes(metrics.metrics.memory_usage)}</span>
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

      {metricsHistory && (
        <div className={styles.history}>
          <h4>CPU 사용률 기록 (1시간)</h4>
          {/* 여기에 차트 컴포넌트를 추가할 수 있습니다 */}
        </div>
      )}
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