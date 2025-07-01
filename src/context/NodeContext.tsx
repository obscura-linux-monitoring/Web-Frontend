// NodeContext.tsx
import { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import WebSocketManager from '../utils/WebSocketManager';
import api from '../api';
import { getToken } from '../utils/Auth';

// 노드 타입 정의
type Node = {
  node_id: string;
  server_type: string;
  status: number;
  node_name: string;
};

// 메트릭 타입 정의
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
  [key: string]: any;
};

// 컨텍스트에서 제공할 값 타입 정의
interface NodeContextType {
  selectedNode: Node | null;
  selectNode: (node: Node) => void;
  clearSelectedNode: () => void;
  monitoringEnabled: boolean;
  toggleMonitoring: () => void;
  nodeMetrics: NodeMetrics | null;
  updateNodeMetrics: (metrics: NodeMetrics) => void;
}

// 기본값으로 Context 생성
const NodeContext = createContext<NodeContextType>({
  selectedNode: null,
  selectNode: () => {},
  clearSelectedNode: () => {},
  monitoringEnabled: true,
  toggleMonitoring: () => {},
  nodeMetrics: null,
  updateNodeMetrics: () => {}
});

// Provider 컴포넌트 생성
export const NodeProvider = ({ children }: { children: ReactNode }) => {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [monitoringEnabled, setMonitoringEnabled] = useState<boolean>(true);
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetrics | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [nodesLoaded, setNodesLoaded] = useState<boolean>(false);
  const [obscuraKey, setObscuraKey] = useState<string | null>(null);

  const location = useLocation();

  // URL에서 nodeId 추출하는 함수 - 개선된 버전
  const getNodeIdFromUrl = useCallback((): string | null => {
    const pathSegments = location.pathname.split('/');
    const nodeIndex = pathSegments.findIndex(segment => segment === 'nodes');
    
    if (nodeIndex !== -1 && pathSegments[nodeIndex + 2]) {
      // /nodes/{page}/{nodeId} 형태에서 nodeId 추출
      // 지원하는 페이지: monitoring, terminal, services, process, docker, performance 등
      const supportedPages = ['monitoring', 'terminal', 'services', 'process', 'docker', 'performance'];
      const pageName = pathSegments[nodeIndex + 1];
      
      if (supportedPages.includes(pageName)) {
        return pathSegments[nodeIndex + 2];
      }
    }
    return null;
  }, [location.pathname]);

  // obscura_key 가져오기
  const fetchObscuraKey = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return null;

      const response = await api.get('/user/profile', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.data && response.data.obscura_key) {
        setObscuraKey(response.data.obscura_key);
        return response.data.obscura_key;
      }
    } catch (error) {
      console.error('obscura_key 가져오기 실패:', error);
    }
    return null;
  }, []);

  // 노드 목록 로드 - obscura_key 사용하도록 수정
  const loadNodes = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) {
        console.log('토큰이 없어서 노드 목록 로드를 건너뜀');
        setNodesLoaded(true);
        return;
      }

      let key = obscuraKey;
      if (!key) {
        console.log('obscura_key가 없어서 먼저 가져오는 중...');
        key = await fetchObscuraKey();
        if (!key) {
          console.error('obscura_key를 가져올 수 없어서 노드 목록 로드 실패');
          setNodesLoaded(true);
          return;
        }
      }

      console.log('노드 목록 로드 시도... obscura_key:', key.substring(0, 20) + '...');
      
      const response = await api.get('/user/nodes', {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          obscura_key: key
        }
      });

      if (response.data && response.data.nodes && Array.isArray(response.data.nodes)) {
        console.log('노드 목록 로드 성공:', response.data.nodes.length, '개');
        setNodes(response.data.nodes);
        setNodesLoaded(true);
      } else {
        console.warn('예상하지 못한 응답 형식:', response.data);
        setNodesLoaded(true);
      }
    } catch (error: any) {
      console.error('노드 목록 로드 실패:', error);
      
      // 상세한 오류 정보 출력
      if (error.response) {
        console.error('응답 상태:', error.response.status);
        console.error('응답 데이터:', error.response.data);
        
        // 422 오류의 경우 특별 처리
        if (error.response.status === 422) {
          console.error('422 오류: obscura_key가 누락되거나 잘못되었습니다.');
        }
      }
      
      setNodesLoaded(true);
    }
  }, [obscuraKey, fetchObscuraKey]);

  // URL 변경 시 선택된 노드 업데이트
  useEffect(() => {
    if (!nodesLoaded) return;

    const urlNodeId = getNodeIdFromUrl();
    console.log('URL에서 추출된 nodeId:', urlNodeId);
    
    if (urlNodeId && nodes.length > 0) {
      // URL에 nodeId가 있으면 해당 노드를 찾아서 선택
      const nodeFromUrl = nodes.find(node => node.node_id === urlNodeId);
      
      if (nodeFromUrl && (!selectedNode || selectedNode.node_id !== urlNodeId)) {
        console.log('URL에서 노드 복원:', nodeFromUrl);
        setSelectedNode(nodeFromUrl);
        setNodeMetrics(null); // 메트릭 초기화
      } else if (!nodeFromUrl) {
        console.warn('URL의 nodeId에 해당하는 노드를 찾을 수 없음:', urlNodeId);
      }
    } else if (!urlNodeId && selectedNode) {
      // URL에 nodeId가 없으면 선택 해제
      console.log('URL에 nodeId가 없어서 선택된 노드 해제');
      setSelectedNode(null);
      setNodeMetrics(null);
    }
  }, [location.pathname, nodes, nodesLoaded, selectedNode, getNodeIdFromUrl]);

  // 컴포넌트 마운트 시 노드 목록 로드
  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  const selectNode = useCallback((node: Node) => {
    setSelectedNode(node);
    // 노드가 변경되면 메트릭도 초기화
    setNodeMetrics(null);
  }, []);

  const clearSelectedNode = useCallback(() => {
    setSelectedNode(null);
    setNodeMetrics(null);
  }, []);
  
  const toggleMonitoring = useCallback(() => {
    setMonitoringEnabled(prev => {
      const newState = !prev;
      
      // WebSocketManager에 모니터링 상태 알림
      WebSocketManager.setMonitoringEnabled(newState);
      
      // 모니터링 비활성화 시 추가 처리
      if (!newState) {
        console.log('모니터링 비활성화: WebSocketManager에 알림');
        
        try {
          // 싱글톤 인스턴스의 연결도 모두 정리
          const wsManager = WebSocketManager.getInstance();
          wsManager.cleanup();
        } catch (err) {
          console.error('WebSocketManager 정리 중 오류:', err);
        }
      }
      
      return newState;
    });
  }, []);
  
  const updateNodeMetrics = useCallback((metrics: NodeMetrics) => {
    setNodeMetrics(metrics);
  }, []);

  return (
    <NodeContext.Provider value={{ 
      selectedNode, 
      selectNode, 
      clearSelectedNode,
      monitoringEnabled,
      toggleMonitoring,
      nodeMetrics,
      updateNodeMetrics
    }}>
      {children}
    </NodeContext.Provider>
  );
};

// 편리하게 사용하기 위한 custom hook
export const useNodeContext = () => useContext(NodeContext);