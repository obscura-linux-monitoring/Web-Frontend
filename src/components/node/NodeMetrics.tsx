import { useEffect, useState } from 'react';
import styles from '../../scss/node/NodeMetric.module.scss';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, YAxisProps
} from 'recharts';

type MetricData = {
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
};

type NodeMetrics = {
  node_id: string;
  metrics: MetricData;
  last_update: string;
};

// 차트에 표시할 시계열 데이터 타입
type TimeSeriesData = MetricData & {
  time: string;
};

interface NodeMetricsProps {
  nodeId: string;
}

// 사용 가능한 모든 메트릭 정의
const AVAILABLE_METRICS = [
  { id: 'cpu_usage', label: 'CPU 사용률', color: '#4ecdc4', unit: '%' },
  { id: 'memory_usage', label: '메모리 사용량', color: '#ff6b6b', unit: '%' },
  { id: 'disk_usage', label: '디스크 사용량', color: '#ffe66d', unit: '%' },
  { id: 'network_rx_bytes', label: '네트워크 수신', color: '#50d890', unit: 'bytes' },
  { id: 'network_tx_bytes', label: '네트워크 송신', color: '#6a8caf', unit: 'bytes' }
];

const NodeMetrics = ({ nodeId }: NodeMetricsProps) => {
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 차트에 표시할 시계열 데이터 (최근 30개 데이터 포인트 저장)
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  // 선택된 메트릭 배열 (여러 메트릭 선택 가능)
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['cpu_usage']);

  useEffect(() => {
    const socket = new WebSocket(`ws://1.209.148.143:8000/influx/ws/metrics/${nodeId}`);

    socket.onopen = () => {
      console.log('📡 WebSocket 연결됨');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMetrics(data);
        
        // 새로운 데이터 포인트를 시계열 데이터에 추가
        const newDataPoint: TimeSeriesData = {
          ...data.metrics,
          time: new Date(data.last_update).toLocaleTimeString(), // 시간만 표시
        };
        
        setTimeSeriesData(prevData => {
          // 최근 30개 데이터 포인트만 유지
          const newData = [...prevData, newDataPoint];
          if (newData.length > 30) {
            return newData.slice(-30);
          }
          return newData;
        });
        
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

  // 메트릭 체크박스 변경 핸들러
  const handleMetricChange = (metricId: string) => {
    setSelectedMetrics(prevSelected => {
      if (prevSelected.includes(metricId)) {
        // 이미 선택된 경우 제거
        return prevSelected.filter(id => id !== metricId);
      } else {
        // 선택되지 않은 경우 추가
        return [...prevSelected, metricId];
      }
    });
  };

  // 모든 메트릭 선택/해제 핸들러
  const handleSelectAllMetrics = () => {
    if (selectedMetrics.length === AVAILABLE_METRICS.length) {
      // 모두 선택된 경우 모두 해제
      setSelectedMetrics([]);
    } else {
      // 일부만 선택된 경우 모두 선택
      setSelectedMetrics(AVAILABLE_METRICS.map(metric => metric.id));
    }
  };

  // 차트 메트릭에 따른 데이터 포맷팅
  const formatChartValue = (value: number, metric: string) => {
    const metricInfo = AVAILABLE_METRICS.find(m => m.id === metric);
    if (metricInfo?.unit === 'bytes') {
      return formatBytes(value);
    } else {
      return `${value.toFixed(2)}%`;
    }
  };

  // 네트워크와 사용률 메트릭 분리 (Y 축이 다름)
  const hasPercentMetrics = selectedMetrics.some(id => 
    AVAILABLE_METRICS.find(m => m.id === id)?.unit === '%'
  );
  
  const hasNetworkMetrics = selectedMetrics.some(id => 
    AVAILABLE_METRICS.find(m => m.id === id)?.unit === 'bytes'
  );

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
      
      {/* 실시간 차트 섹션 추가 */}
      <div className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <h4>실시간 모니터링</h4>
          <button 
            className={styles.selectAllButton}
            onClick={handleSelectAllMetrics}
          >
            {selectedMetrics.length === AVAILABLE_METRICS.length ? '모두 해제' : '모두 선택'}
          </button>
        </div>
        
        <div className={styles.metricsSelection}>
          {AVAILABLE_METRICS.map(metric => (
            <label key={metric.id} className={styles.metricCheckbox}>
              <input
                type="checkbox"
                checked={selectedMetrics.includes(metric.id)}
                onChange={() => handleMetricChange(metric.id)}
              />
              <span className={styles.checkmark} style={{ backgroundColor: selectedMetrics.includes(metric.id) ? metric.color : '' }}></span>
              <span>{metric.label}</span>
            </label>
          ))}
        </div>
        
        <div className={styles.chartContainer}>
          {timeSeriesData.length > 1 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={timeSeriesData}
                margin={{
                  top: 10,
                  right: 30,
                  left: 20,
                  bottom: 20,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fill: '#aaa', fontSize: 11 }}
                  tickMargin={10}
                  interval="preserveStartEnd"
                />
                
                {/* 퍼센트(%) 단위를 위한 Y축 */}
                {hasPercentMetrics && (
                  <YAxis 
                    yAxisId="percent"
                    domain={[0, 100]}
                    tick={{ fill: '#aaa', fontSize: 11 }}
                    tickFormatter={(value) => `${value}%`}
                    label={{ value: '%', angle: -90, position: 'insideLeft', fill: '#aaa', fontSize: 12 }}
                  />
                )}
                
                {/* 바이트 단위를 위한 Y축 */}
                {hasNetworkMetrics && (
                  <YAxis 
                    yAxisId="bytes"
                    orientation="right"
                    tick={{ fill: '#aaa', fontSize: 11 }}
                    tickFormatter={(value) => formatBytes(value).split(' ')[0]}
                    label={{ value: 'Bytes/s', angle: 90, position: 'insideRight', fill: '#aaa', fontSize: 12 }}
                  />
                )}
                
                <Tooltip 
                  contentStyle={{ backgroundColor: '#2c2c2c', border: '1px solid #444', borderRadius: '4px' }}
                  labelStyle={{ color: '#ddd' }}
                  formatter={(value: number, name: string) => {
                    const metricInfo = AVAILABLE_METRICS.find(m => m.id === name);
                    return [
                      metricInfo?.unit === 'bytes' ? formatBytes(value) : `${value.toFixed(2)}%`,
                      metricInfo?.label || name
                    ];
                  }}
                />
                <Legend />
                
                {/* 선택된 메트릭에 대해 Line 컴포넌트 추가 */}
                {selectedMetrics.map(metricId => {
                  const metricInfo = AVAILABLE_METRICS.find(m => m.id === metricId);
                  if (!metricInfo) return null;
                  
                  return (
                    <Line
                      key={metricId}
                      type="monotone"
                      dataKey={metricId}
                      name={metricInfo.label}
                      stroke={metricInfo.color}
                      yAxisId={metricInfo.unit === 'bytes' ? 'bytes' : 'percent'}
                      activeDot={{ r: 6 }}
                      dot={false}
                      animationDuration={300}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.noChartData}>
              데이터를 수집 중입니다...
            </div>
          )}
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