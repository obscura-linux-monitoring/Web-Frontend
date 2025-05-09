// NodeContext.tsx
import { createContext, useState, useContext, ReactNode, useCallback } from 'react';

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
    setMonitoringEnabled(prev => !prev);
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