import { useEffect, useRef, useState } from 'react';
import styles from '../../scss/node/NodeMetrics.module.scss';
import '../../scss/node/node_mobile/NodeMetrics.module.mobile.scss';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useParams } from 'react-router-dom';
import { useNodeContext } from '../../context/NodeContext';

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
  timestamp: number;
};

// 사용 가능한 모든 메트릭 정의
const AVAILABLE_METRICS = [
  { id: 'cpu_usage', label: 'CPU 사용률', color: '#4ecdc4', unit: '%' },
  { id: 'memory_usage', label: '메모리 사용량', color: '#ff6b6b', unit: '%' },
  { id: 'disk_usage', label: '디스크 사용량', color: '#ffe66d', unit: '%' },
  { id: 'network_rx_bytes', label: '네트워크 수신', color: '#50d890', unit: 'bytes' },
  { id: 'network_tx_bytes', label: '네트워크 송신', color: '#6a8caf', unit: 'bytes' }
];

const NodeMetrics = () => {
  const { nodeId } = useParams<{ nodeId: string }>();
  // NodeContext에서 monitoringEnabled 상태 가져오기 (updateNodeMetrics 제거)
  const { selectedNode, monitoringEnabled } = useNodeContext();
  
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['cpu_usage']);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [connected, setConnected] = useState<boolean>(false);

  // WebSocket 연결 관리
  useEffect(() => {
    if (!nodeId) {
      setError("유효한 노드 ID가 필요합니다");
      setLoading(false);
      return;
    }
    
    // 모니터링이 비활성화되어 있으면 웹소켓 연결 중단
    if (!monitoringEnabled) {
      if (socketRef.current) {
        socketRef.current.close(1000, "모니터링 비활성화");
        socketRef.current = null;
      }
      setConnected(false);
      return;
    }
    
    // 웹소켓 연결 함수
    const connectWebSocket = () => {
      // 이미 연결된 소켓이 있으면 닫기
      if (socketRef.current) {
        socketRef.current.close();
      }
      
      const socket = new WebSocket(`ws://1.209.148.143:8000/influx/ws/metrics/${nodeId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('📡 WebSocket 연결됨 - 노드 메트릭');
        setConnected(true);
        // 재연결 타임아웃이 설정되어 있으면 제거
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMetrics(data);
          
          // NodeContext 업데이트 코드 제거 (독립 구현 방식)
          
          const newDataPoint: TimeSeriesData = {
            ...data.metrics,
            time: new Date(data.last_update).toLocaleTimeString(),
            timestamp: new Date(data.last_update).getTime() // timestamp 추가
          };
          
          setTimeSeriesData(prevData => {
            const newData = [...prevData, newDataPoint];
            return newData.length > 30 ? newData.slice(-30) : newData;
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
        setConnected(false);
      };

      socket.onclose = (event) => {
        console.log('🔌 WebSocket 연결 종료 - 노드 메트릭');
        setConnected(false);
        
        // 모니터링이 활성화되어 있고 비정상적인 종료일 경우에만 자동 재연결 시도
        if (monitoringEnabled && event.code !== 1000) {
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
  }, [nodeId, monitoringEnabled]); // updateNodeMetrics 의존성 제거

  // 메트릭 체크박스 변경 핸들러
  const handleMetricChange = (metricId: string) => {
    setSelectedMetrics(prevSelected => {
      if (prevSelected.includes(metricId)) {
        return prevSelected.filter(id => id !== metricId);
      } else {
        return [...prevSelected, metricId];
      }
    });
  };

  // 모든 메트릭 선택/해제 핸들러
  const handleSelectAllMetrics = () => {
    if (selectedMetrics.length === AVAILABLE_METRICS.length) {
      setSelectedMetrics([]);
    } else {
      setSelectedMetrics(AVAILABLE_METRICS.map(metric => metric.id));
    }
  };

  // 네트워크와 사용률 메트릭 분리 (Y 축이 다름)
  const hasPercentMetrics = selectedMetrics.some(id => 
    AVAILABLE_METRICS.find(m => m.id === id)?.unit === '%'
  );
  
  const hasNetworkMetrics = selectedMetrics.some(id => 
    AVAILABLE_METRICS.find(m => m.id === id)?.unit === 'bytes'
  );

  if (loading && !metrics && monitoringEnabled) return <div className={styles.loading}>데이터 로딩 중...</div>;
  if (error && monitoringEnabled) return <div className={styles.error}>{error}</div>;
  if (!metrics && monitoringEnabled) return null;

  return (
    <div className={styles.container}>
      {/* 모니터링 비활성화 상태 알림 */}
      {!monitoringEnabled && (
        <div className={styles.monitoringDisabled}>
          <p>모니터링이 비활성화되어 있습니다. 헤더에서 모니터링을 활성화해주세요.</p>
        </div>
      )}
      
      <div className={styles.metricsContainer}>
        <div className={styles.currentMetrics}>
          <h4>현재 상태</h4>
          <div className={styles.metricsGrid}>
            <div className={styles.metricItem}>
              <span className={styles.label}>CPU 사용률</span>
              <span className={styles.value}>{monitoringEnabled ? metrics?.metrics.cpu_usage?.toFixed(2) + '%' : '비활성화'}</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.label}>메모리 사용량</span>
              <span className={styles.value}>{monitoringEnabled ? metrics?.metrics.memory_usage?.toFixed(2) + '%' : '비활성화'}</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.label}>디스크 사용량</span>
              <span className={styles.value}>{monitoringEnabled ? metrics?.metrics.disk_usage?.toFixed(2) + '%' : '비활성화'}</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.label}>네트워크 수신</span>
              <span className={styles.value}>{monitoringEnabled ? formatBytes(metrics?.metrics.network_rx_bytes || 0) + '/s' : '비활성화'}</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.label}>네트워크 송신</span>
              <span className={styles.value}>{monitoringEnabled ? formatBytes(metrics?.metrics.network_tx_bytes || 0) + '/s' : '비활성화'}</span>
            </div>
          </div>
          <div className={styles.lastUpdate}>
            마지막 업데이트: {monitoringEnabled && metrics ? new Date(metrics.last_update).toLocaleString() : '비활성화'}
          </div>
        </div>
        
        {/* 실시간 차트 섹션 */}
        <div className={styles.chartSection}>
          <div className={styles.chartHeader}>
            <h4>실시간 모니터링</h4>
            <button 
              className={styles.selectAllButton}
              onClick={handleSelectAllMetrics}
              disabled={!monitoringEnabled}
            >
              {selectedMetrics.length === AVAILABLE_METRICS.length ? '모두 해제' : '모두 선택'}
            </button>
          </div>
          
          <div className={styles.metricsSelection}>
            {AVAILABLE_METRICS.map(metric => (
              <label 
                key={metric.id} 
                className={`${styles.metricCheckbox} ${!monitoringEnabled ? styles.disabled : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedMetrics.includes(metric.id)}
                  onChange={() => handleMetricChange(metric.id)}
                  disabled={!monitoringEnabled}
                />
                <span 
                  className={styles.checkmark} 
                  style={{ 
                    backgroundColor: selectedMetrics.includes(metric.id) && monitoringEnabled ? metric.color : '',
                    opacity: !monitoringEnabled ? 0.5 : 1
                  }}
                ></span>
                <span>{metric.label}</span>
              </label>
            ))}
          </div>
          
          <div className={styles.chartContainer}>
            {monitoringEnabled && timeSeriesData.length > 1 ? (
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
                {monitoringEnabled ? '데이터를 수집 중입니다...' : '모니터링이 비활성화되어 있습니다'}
              </div>
            )}
          </div>
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