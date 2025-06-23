import React, { useEffect, useState, useRef } from 'react';
import Widget, { WidgetProps } from './Widget';
import style from '../../scss/widget/metricsWidget.scss';
import api from '../../api';
import { getUserFromToken, getToken } from '../../utils/Auth';
import { AxiosError } from 'axios';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export interface CpuMetricsWidgetProps extends Omit<WidgetProps, 'children'> {
  nodeId?: string;
  minWidth?: string;
  minHeight?: string;
}

type MetricData = {
  cpu_usage: number;
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

type Node = {
  id: string;
  name: string;
  status: 'active' | 'inactive' | string;
  statusValue?: number; // 상태 값(1: 활성, 0: 비활성)
};

const CpuMetricsWidget: React.FC<CpuMetricsWidgetProps> = ({
  nodeId,
  minWidth = '300px',
  minHeight = '200px',
  ...widgetProps
}) => {
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNodeActive, setIsNodeActive] = useState<boolean>(false);
  const [connected, setConnected] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [obscuraKey, setObscuraKey] = useState<string>('');
  
  // 노드 관련 상태
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodeId || null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [loadingNodes, setLoadingNodes] = useState<boolean>(true);
  const initialFetchDone = useRef<boolean>(false);

  // 그래프 관련 상태
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);

  // 사용자 소유 노드 목록 가져오기
  useEffect(() => {
    // 이미 초기 불러오기가 완료되었다면 다시 실행하지 않음
    if (initialFetchDone.current) return;
    
    const fetchNodes = async () => {
      setLoadingNodes(true);
      try {
        console.log('노드 목록 가져오기 시작');
        
        // 사용자 인증 토큰 가져오기
        const token = getToken();
        if (!token) {
          throw new Error('인증 토큰이 없습니다');
        }

        // 사용자 프로필 정보 가져오기
        const profileRes = await api.get('/user/profile', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        console.log("프로필 응답 데이터:", profileRes.data);
        const userObscuraKey = profileRes.data.obscura_key;
        setObscuraKey(userObscuraKey);

        // SideBar.tsx와 동일한 API 엔드포인트 사용
        const nodesRes = await api.get('/user/nodes', {
          params: {
            obscura_key: userObscuraKey
          },
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
        
        console.log('가져온 노드 목록:', nodesRes.data);
        
        // SideBar.tsx에서는 nodes를 받는 형태임
        const data = nodesRes.data.nodes || [];
        
        let nodeList: Node[] = [];
        
        if (Array.isArray(data) && data.length > 0) {
          nodeList = data.map((node: any) => ({
            id: node.node_id || node.id,
            name: node.node_name || node.name || node.hostname || node.node_id || '알 수 없는 노드',
            status: node.status === 1 ? 'active' : 'inactive',
            statusValue: node.status // 상태 값 저장 (1: 활성, 0: 비활성)
          }));
        }
        
        console.log('처리된 노드 목록:', nodeList);
        setNodes(nodeList);
        
        // 기본 노드 설정 (외부에서 nodeId가 제공되지 않은 경우 첫 번째 노드 선택)
        if (!selectedNodeId && nodeList.length > 0) {
          console.log('첫 번째 노드 자동 선택:', nodeList[0].id);
          setSelectedNodeId(nodeList[0].id);
          setSelectedNode(nodeList[0]);
          setIsNodeActive(nodeList[0].statusValue === 1);
        } else if (selectedNodeId && nodeList.length > 0) {
          // 이미 선택된 노드가 있으면 해당 노드 정보 설정
          const node = nodeList.find(n => n.id === selectedNodeId);
          if (node) {
            setSelectedNode(node);
            setIsNodeActive(node.statusValue === 1);
          }
        }
        
        initialFetchDone.current = true;
      } catch (err: any) {
        console.error('❌ 노드 목록 가져오기 실패:', err);
        
        // 오류 로그 상세화
        if (err.response) {
          // 서버 응답이 있는 경우
          console.error('서버 응답 상태:', err.response.status);
          console.error('서버 응답 데이터:', err.response.data);
        } else if (err.request) {
          // 요청은 보냈지만 응답이 없는 경우
          console.error('응답을 받지 못했습니다:', err.request);
        } else {
          // 요청 설정 중 오류가 발생한 경우
          console.error('요청 설정 오류:', err.message);
        }
        
        setError('노드 목록을 가져오는데 실패했습니다');
        
        initialFetchDone.current = true;
      } finally {
        setLoadingNodes(false);
      }
    };
    
    fetchNodes();
  }, []);

  // 선택된 노드가 변경될 때마다 실행
  useEffect(() => {
    if (selectedNodeId) {
      console.log('선택된 노드 ID:', selectedNodeId);
      // 노드가 변경되면 시계열 데이터 초기화
      setTimeSeriesData([]);
      
      // 선택된 노드 정보 업데이트
      const node = nodes.find(n => n.id === selectedNodeId);
      if (node) {
        setSelectedNode(node);
        // 노드 상태에 따라 활성화 여부 설정 (SideBar.tsx 참고)
        setIsNodeActive(node.statusValue === 1);
      }
    }
  }, [selectedNodeId, nodes]);

  // 노드 변경 처리
  const handleNodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newNodeId = e.target.value;
    console.log('노드 선택 변경:', newNodeId);
    setSelectedNodeId(newNodeId);
  };

  // WebSocket 연결 관리
  useEffect(() => {
    if (!selectedNodeId) {
      // 선택된 노드가 없으면 WebSocket 연결 시도하지 않음
      console.log('선택된 노드 없음, WebSocket 연결 중단');
      return;
    }
    
    // 노드가 비활성화된 경우 WebSocket 연결 중단
    if (!isNodeActive) {
      console.log('노드가 비활성화 상태, WebSocket 연결 중단');
      return;
    }
    
    console.log('WebSocket 연결 시도:', selectedNodeId);
    setLoading(true);
    setError(null);
    
    // 웹소켓 연결 함수
    const connectWebSocket = () => {
      // 이미 연결된 소켓이 있으면 닫기
      if (socketRef.current) {
        socketRef.current.close();
      }
      
      // 인증 토큰 가져오기
      const token = getToken();
      // WebSocket URL에 obscura_key 추가
      const wsUrl = `ws://1.209.148.143:8000/influx/ws/metrics/${selectedNodeId}?obscura_key=${obscuraKey}`;
      console.log('WebSocket URL:', wsUrl);
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log(`📡 WebSocket 연결됨 - CPU 메트릭 위젯 (노드: ${selectedNodeId})`);
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
          
          // CPU 데이터만 추출하여 저장
          const cpuMetrics = {
            node_id: data.node_id,
            metrics: { cpu_usage: data.metrics.cpu_usage },
            last_update: data.last_update
          };
          
          setMetrics(cpuMetrics);
          
          // 시계열 데이터에 추가
          const newDataPoint: TimeSeriesData = {
            cpu_usage: data.metrics.cpu_usage,
            time: new Date(data.last_update).toLocaleTimeString(),
            timestamp: new Date(data.last_update).getTime()
          };
          
          setTimeSeriesData(prevData => {
            const newData = [...prevData, newDataPoint];
            // 최대 30개 데이터포인트만 유지
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
        console.log(`🔌 WebSocket 연결 종료 - CPU 메트릭 위젯 (노드: ${selectedNodeId})`);
        setConnected(false);
        
        // 비정상적인 종료일 경우에만 자동 재연결 시도
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, 5000); // 5초 후 재연결
        }
      };
    };

    connectWebSocket();

    // cleanup 함수
    return () => {
      if (socketRef.current) {
        socketRef.current.close(1000, "Widget unmounted");
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [selectedNodeId, obscuraKey, isNodeActive]);

  const widgetStyle = {
    minWidth,
    minHeight,
  };

  // 노드 선택 드롭다운 렌더링
  const renderNodeSelector = () => (
    <select 
      value={selectedNodeId || ''} 
      onChange={handleNodeChange}
      disabled={loadingNodes}
      className="node-select"
    >
      {loadingNodes ? (
        <option value="">노드 목록 로딩 중...</option>
      ) : nodes.length === 0 ? (
        <option value="">사용 가능한 노드 없음</option>
      ) : (
        <>
          <option value="">노드 선택</option>
          {nodes.map(node => (
            <option key={node.id} value={node.id}>
              {node.name} {node.statusValue === 0 ? "(수집 중단)" : ""}
            </option>
          ))}
        </>
      )}
    </select>
  );

  return (
    <Widget 
      {...widgetProps} 
      title={
        <div className="widget-title-with-selector">
          <span>CPU 사용률</span>
          {renderNodeSelector()}
        </div>
      }
    >
      <div className="metrics-widget" style={widgetStyle}>
        {loadingNodes ? (
          <div className="loading-message">
            <p>노드 정보를 불러오는 중...</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="error-message">
            <p>사용 가능한 노드가 없습니다</p>
          </div>
        ) : !selectedNodeId ? (
          <div className="error-message">
            <p>노드를 선택해주세요</p>
          </div>
        ) : !isNodeActive ? (
          <div className="inactive-message">
            <p>선택한 노드는 현재 수집이 중단된 상태입니다.</p>
            <p>노드 상태를 확인해주세요.</p>
          </div>
        ) : loading ? (
          <div className="loading-message">
            <p>데이터를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="error-message">
            <p>{error}</p>
          </div>
        ) : (
          <div className="metrics-content">
            {/* CPU 메트릭 차트 */}
            <div className="chart-section">
              <div className="chart-container">
                {timeSeriesData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={200}>
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
                      
                      <YAxis 
                        domain={[0, 100]}
                        tick={{ fill: '#aaa', fontSize: 11 }}
                        tickFormatter={(value) => `${value}%`}
                        label={{ value: '%', angle: -90, position: 'insideLeft', fill: '#aaa', fontSize: 12 }}
                      />
                      
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#2c2c2c', border: '1px solid #444', borderRadius: '4px' }}
                        labelStyle={{ color: '#ddd' }}
                        formatter={(value: number) => [`${value.toFixed(2)}%`, 'CPU 사용률']}
                      />
                      
                      <Line
                        type="monotone"
                        dataKey="cpu_usage"
                        name="CPU 사용률"
                        stroke="#4ecdc4"
                        activeDot={{ r: 6 }}
                        dot={false}
                        animationDuration={300}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="no-chart-data">
                    데이터를 수집 중입니다...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Widget>
  );
};

export default CpuMetricsWidget; 