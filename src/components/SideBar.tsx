import { Link, useLocation } from 'react-router-dom';
import styles from '../scss/SideBar.module.scss';
import { useEffect, useState, useRef } from 'react';
import api from '../api';
import { getToken } from '../utils/Auth';
import { useNodeContext } from '../context/NodeContext';

type Node = {
  node_id: string;
  server_type: string;
  status: number;
  node_name: string;
};

const SideBar = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectedNode, selectNode } = useNodeContext();
  const location = useLocation();
  const fetchedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  
  // 사용자의 노드 목록을 가져오는 함수 - 최초 한 번만 실행
  useEffect(() => {
    // 이미 데이터를 가져왔다면 중복 요청 방지
    if (fetchedRef.current) return;
    
    const fetchNodes = async () => {
      const token = getToken();
      if (!token) return;
      
      setLoading(true);
      try {
        // 사용자 프로필 정보 가져오기
        const profileRes = await api.get('/user/profile', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        const obscuraKey = profileRes.data.obscura_key;
        
        // 노드 목록 가져오기
        const nodesRes = await api.get('/user/nodes', {
          params: {
            obscura_key: obscuraKey
          }
        });
        setNodes(nodesRes.data.nodes);
        fetchedRef.current = true;
        
        // WebSocket 연결
        const ws = new WebSocket(`ws://1.209.148.143:8000/user/ws/nodes?obscura_key=${obscuraKey}&token=${token}`);
        
        ws.onopen = () => {
          console.log('WebSocket 연결 성공');
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // console.log('WebSocket 메시지 수신:', data);
            
            if (data.type === 'node_status_update') {
              // 함수형 업데이트를 사용하여 최신 상태 보장
              setNodes(prevNodes => {
                // console.log('이전 노드:', prevNodes);
                // console.log('새 노드 데이터:', data.nodes);
                return data.nodes;
              });
            }
          } catch (err) {
            console.error('WebSocket 메시지 처리 오류:', err);
          }
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket 오류:', error);
        };
        
        ws.onclose = () => {
          console.log('WebSocket 연결 종료');
        };
        
        wsRef.current = ws;
        
      } catch (err) {
        console.error('노드 목록 로딩 실패:', err);
        setError('노드 목록을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchNodes();
    
    // 컴포넌트 언마운트 시 WebSocket 연결 해제
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);
  
  // URL에서 nodeId 추출하여 현재 선택된 노드 설정
  useEffect(() => {
    if (nodes.length === 0) return;
    
    const path = location.pathname;
    const match = path.match(/\/nodes\/\w+\/([^/]+)/);
    if (match && match[1]) {
      const currentNodeId = match[1];
      const currentNode = nodes.find(node => node.node_id === currentNodeId);
      
      if (currentNode && (!selectedNode || selectedNode.node_id !== currentNodeId)) {
        selectNode(currentNode);
      }
    }
  }, [location.pathname, nodes, selectedNode, selectNode]);
  
  // 노드 선택 핸들러
  const handleNodeSelect = (node: Node) => {
    selectNode(node);
  };

  // 상태 표시 함수
  const getStatusIndicator = (status: number) => {
    return (
      <span className={`${styles.statusIndicator} ${status === 1 ? styles.active : styles.inactive}`}>
        {status === 1 ? '●' : '○'}
      </span>
    );
  };

  return (
    <div className={styles.sidebar}>
      <h3>🔧 메뉴</h3>
      <ul>
        <li className={styles.nodeListSection}>
          <div className={styles.nodeListHeader}>🧩 노드 목록</div>
          <div className={styles.nodeList}>
            {loading ? (
              <div className={styles.nodeItem}>⏳ 로딩 중...</div>
            ) : error ? (
              <div className={styles.nodeItem}>❌ {error}</div>
            ) : nodes.length === 0 ? (
              <div className={styles.nodeItem}>등록된 노드가 없습니다</div>
            ) : (
              nodes.map(node => (
                <Link 
                  key={node.node_id}
                  to={`/nodes/monitoring/${node.node_id}`}
                  className={`${styles.nodeItem} ${
                    selectedNode?.node_id === node.node_id ? styles.active : ''
                  }`}
                  onClick={() => handleNodeSelect(node)}
                >
                  {getStatusIndicator(node.status)}
                  <span className={styles.nodeInfo}>
                    {node.node_name}
                    {node.status === 0 && (
                      <span className={styles.statusText}> (수집 중단)</span>
                    )}
                  </span>
                </Link>
              ))
            )}
          </div>
        </li>
        
        <li><Link to="/settings">⚙️ 설정</Link></li>
      </ul>
    </div>
  );
};

export default SideBar;