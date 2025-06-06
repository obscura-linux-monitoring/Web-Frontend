import React, { useRef, useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart, registerables } from 'chart.js';
import { usePerformanceData } from '../../hooks/usePerformanceData';
import { PerformanceDataType } from '../../utils/WebSocketManager';
import styles from '../../scss/performance/MiniPerformanceGraph.module.scss';
import { useNodeContext } from '../../context/NodeContext';

// 차트 컴포넌트에 필요한 모듈들 등록
Chart.register(...registerables);

interface MiniGraphProps {
  type: PerformanceDataType;
  resourceId?: string;
  color: string;
  name?: string;
  model?: string;
}

const MiniPerformanceGraph: React.FC<MiniGraphProps> = ({ 
  type, 
  resourceId = '0', 
  color,
  name,
  model
}) => {
  // 차트 요소에 대한 참조 생성
  const chartRef = useRef<any>(null);
  
  // 렌더링 시도 카운터와 오류 상태
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [chartError, setChartError] = useState(false);
  
  // NodeContext에서 모니터링 상태 가져오기
  const { monitoringEnabled } = useNodeContext();
  
  // 중앙화된 WebSocket 데이터 사용 - monitoringEnabled 전달
  const { dataPoints, isConnected, error, details } = usePerformanceData(
    type, 
    resourceId, 
    monitoringEnabled // 모니터링 상태 전달
  );
  
  // 컴포넌트 고유 ID 생성
  const chartId = `chart-${type}-${resourceId}-${renderAttempt}`;

  // 데이터 업데이트에 따른 차트 오류 상태 초기화
  useEffect(() => {
    if (dataPoints.length > 0) {
      setChartError(false);
    }
  }, [dataPoints]);

  // 차트 렌더링 재시도
  useEffect(() => {
    // 30초마다 차트 렌더링 재시도
    const timer = setTimeout(() => {
      if ((dataPoints.length === 0 || chartError) && monitoringEnabled && isConnected) {
        console.log(`[${type}:${resourceId}] 차트 렌더링 재시도`);
        setRenderAttempt(prev => prev + 1);
      }
    }, 30000);
    
    return () => clearTimeout(timer);
  }, [dataPoints.length, monitoringEnabled, isConnected, type, resourceId, chartError]);

  // 데이터 변경 로깅
  useEffect(() => {
     console.log(`[${type}:${resourceId}] 데이터 업데이트:`, {
      dataPoints: dataPoints.length,
      values: dataPoints.length > 0 ? dataPoints.map(d => d.value) : [],
      lastValue: dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].value : null,
      connected: isConnected,
      details: details ? JSON.stringify(details) : 'no details',
      chartError
    });
    
    // 차트 오류 상태 초기화
    if (dataPoints.length > 0 && chartError) {
      console.log(`[${type}:${resourceId}] 데이터 수신으로 차트 오류 상태 초기화`);
      setChartError(false);
      setRenderAttempt(prev => prev + 1);
    }
  }, [dataPoints, isConnected, details, type, resourceId, chartError]);

  // 타입별로 다른 차트 옵션 적용을 위한 함수
  const getChartOptions = () => {
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: { enabled: false }
      },
      scales: {
        x: { 
          display: false,
          type: 'category' // linear에서 category로 변경
        },
        y: { 
          display: false,
          min: 0,
          // 네트워크 타입일 경우에는 max 값 설정하지 않음
          max: type === 'network' || type === 'ethernet' || type === 'wifi' ? undefined : 100,
          // adapters 속성 제거 - Chart.js에서 지원하지 않는 형식
        },
      },
      animation: false, // 애니메이션 완전히 비활성화
    };

    return baseOptions;
  };

  // 차트 옵션 함수 호출
  const chartOptions = getChartOptions();

  // 그래프 데이터 구성
  const chartData = {
    labels: dataPoints.map((_, index) => index.toString()),
    datasets: [
      {
        data: dataPoints.map(p => {
          // 유효하지 않은 값 필터링 (NaN, undefined 등)
          if (isNaN(p.value) || p.value === undefined || p.value === null) {
            console.warn(`[${type}:${resourceId}] 유효하지 않은 데이터 포인트:`, p);
            return 0; // 기본값으로 대체
          }
          
          // 네트워크 타입이 아닌 경우 100을 넘지 않도록 제한 (차트 오류 방지)
          if (type !== 'network' && type !== 'ethernet' && type !== 'wifi') {
            return Math.min(p.value, 100);
          }
          return p.value;
        }),
        borderColor: color,
        backgroundColor: `${color}33`,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2, // 선 두께 지정
      },
    ],
  };

  // 차트 인스턴스 정리 효과
  useEffect(() => {
    return () => {
      if (chartRef.current && chartRef.current.chartInstance) {
        try {
          chartRef.current.chartInstance.destroy();
        } catch (err) {
          console.error("차트 정리 중 오류:", err);
        }
      }
    };
  }, []);

  useEffect(() => {
      console.log(`[${type}:${resourceId}] 컴포넌트 마운트됨`);
    return () => {
      console.log(`[${type}:${resourceId}] 컴포넌트 언마운트됨`);
    };
  }, []);

  // 리소스 정보 텍스트 생성
  const getResourceInfo = () => {
    const lastValue = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].value : 0;
    
    switch(type) {
      case 'cpu':
        return (
          <>
            <div className={styles.resourceName}>
              {name || 'CPU'}
            </div>
            <div className={styles.resourceValue}>
              {dataPoints.length > 0 ? `${lastValue.toFixed(0)}% ${details?.speed || ''}` : '데이터 대기중...'}
            </div>
          </>
        );
        
      case 'memory':
        return (
          <>
            <div className={styles.resourceName}>
              {name || '메모리'}
            </div>
            <div className={styles.resourceValue}>
              {dataPoints.length > 0 
                ? `${details?.used_gb || '0'}/${details?.total_gb || '0'}GB (${lastValue.toFixed(0)}%)` 
                : '데이터 대기중...'}
            </div>
          </>
        );
        
      case 'disk':
        return (
          <>
            <div className={styles.resourceName}>
              {name || `디스크 ${resourceId}`}
            </div>
            <div className={styles.resourceType}>
              {details?.type || model || 'SSD'}
            </div>
            <div className={styles.resourceValue}>
              {dataPoints.length > 0 ? `${lastValue.toFixed(0)}%` : '데이터 대기중...'}
            </div>
          </>
        );
        
      case 'ethernet':
      case 'network':
        return (
          <>
            <div className={styles.resourceName}>
              {name || details?.name || '이더넷'}
            </div>
            <div className={styles.resourceType}>
              {details?.interface_name || details?.interface || details?.model || ''}
            </div>
            <div className={styles.resourceValue}>
              {dataPoints.length > 0 
                ? `S: ${details?.tx || '0'} R: ${details?.rx || '0'} Kbps` 
                : '데이터 대기중...'}
            </div>
          </>
        );
        
      case 'wifi':
        return (
          <>
            <div className={styles.resourceName}>
              Wi-Fi
            </div>
            <div className={styles.resourceType}>
              {details?.ssid || ''}
            </div>
            <div className={styles.resourceValue}>
              {dataPoints.length > 0 
                ? `S: ${details?.tx || '0'} R: ${details?.rx || '0'} Kbps` 
                : '데이터 대기중...'}
            </div>
          </>
        );
        
      default:
        return (
          <>
            <div className={styles.resourceName}>
              {name || type}
            </div>
            <div className={styles.resourceValue}>
              {dataPoints.length > 0 ? `${lastValue.toFixed(0)}%` : '데이터 대기중...'}
            </div>
          </>
        );
    }
  };

  // 컴포넌트 렌더링
  if (!monitoringEnabled) {
    return (
      <div className={styles.resourceItem}>
        <div className={styles.miniGraph}>
          <div className={styles.disabledGraph}>
            <span className={styles.disabledText}>모니터링 OFF</span>
          </div>
        </div>
        <div className={styles.resourceInfo}>
          {getResourceInfo()}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.resourceItem}>
        <div className={styles.miniGraph}>
          <div className={styles.errorGraph}>
            <span className={styles.errorText}>오류</span>
          </div>
        </div>
        <div className={styles.resourceInfo}>
          {getResourceInfo()}
        </div>
      </div>
    );
  }

  // 안전하게 차트 렌더링 시도
  const renderChart = () => {
    try {
      if (dataPoints.length > 0) {
        const values = dataPoints.map(d => d.value);
        const hasInvalidValues = values.some(v => isNaN(v) || v === undefined || v === null);
        
        console.log(`[${type}:${resourceId}] 차트 렌더링 시도:`, {
          dataPoints: dataPoints.length,
          chartId,
          renderAttempt,
          values: values.slice(-3), // 마지막 3개 값만 로그 출력
          hasInvalidValues,
          chartOptions: JSON.stringify(chartOptions)
        });
        
        if (hasInvalidValues) {
          console.warn(`[${type}:${resourceId}] 유효하지 않은 값이 있어 차트 렌더링에 문제가 발생할 수 있습니다.`);
        }
        
        return (
          <Line 
            data={chartData} 
            options={chartOptions as any} 
            key={chartId}
            ref={chartRef}
          />
        );
      }
      console.log(`[${type}:${resourceId}] 데이터 없음, 로딩 표시`);
      return (
        <div className={styles.loadingGraph}>
          <span className={styles.loadingText}>
            {isConnected ? '데이터 대기중' : '연결 중...'}
          </span>
        </div>
      );
    } catch (err) {
      console.error(`[${type}:${resourceId}] 차트 렌더링 오류:`, err);
      setChartError(true);
      return (
        <div className={styles.errorGraph}>
          <span className={styles.errorText}>차트 오류</span>
          <span className={styles.errorSubText}>{err instanceof Error ? err.message : String(err)}</span>
        </div>
      );
    }
  };

  return (
    <div className={styles.resourceItem}>
      <div className={styles.miniGraph}>
        {renderChart()}
      </div>
      <div className={styles.resourceInfo}>
        {getResourceInfo()}
      </div>
    </div>
  );
};

export default React.memo(MiniPerformanceGraph);