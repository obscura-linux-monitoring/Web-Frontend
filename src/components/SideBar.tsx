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
  
  // 노드 이름 변경 관련 상태
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState<string>('');
  const [obscuraKey, setObscuraKey] = useState<string>('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
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
        
        const userObscuraKey = profileRes.data.obscura_key;
        setObscuraKey(userObscuraKey);
        
        // 노드 목록 가져오기
        const nodesRes = await api.get('/user/nodes', {
          params: {
            obscura_key: userObscuraKey
          }
        });
        setNodes(nodesRes.data.nodes);
        fetchedRef.current = true;
        
        // WebSocket 연결
        const ws = new WebSocket(`ws://1.209.148.143:8000/user/ws/nodes?obscura_key=${userObscuraKey}&token=${token}`);
        
        ws.onopen = () => {
          console.log('WebSocket 연결 성공');
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'node_status_update') {
              // 함수형 업데이트를 사용하여 최신 상태 보장
              setNodes(prevNodes => {
                // 편집 중인 노드의 이름은 변경되지 않도록 처리
                if (editNodeId) {
                  return data.nodes.map((node: Node) => {
                    if (node.node_id === editNodeId) {
                      // 편집 중인 노드는 이전 노드의 이름 유지
                      const prevNode = prevNodes.find(n => n.node_id === editNodeId);
                      return { ...node, node_name: prevNode?.node_name || node.node_name };
                    }
                    return node;
                  });
                }
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
  
  // 편집 모드 시작 시 입력 필드에 포커스
  useEffect(() => {
    if (editNodeId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editNodeId]);
  
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
  
  // 노드 이름 편집 시작
  const startEditNodeName = (node: Node, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditNodeId(node.node_id);
    setNewNodeName(node.node_name);
    setRenameError(null);
  };
  
  // 노드 이름 편집 취소
  const cancelEditNodeName = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setEditNodeId(null);
    setNewNodeName('');
    setRenameError(null);
  };
  
  // 노드 이름 변경 저장
  const saveNodeName = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newNodeName.trim()) {
      setRenameError('노드 이름을 입력해주세요.');
      return;
    }
    
    try {
      const token = getToken();
      const response = await api.patch('/user/nodes/rename', {
        node_id: editNodeId,
        new_name: newNodeName.trim(),
        obscura_key: obscuraKey
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      // 성공적으로 변경됐을 경우 노드 목록 업데이트
      setNodes(prevNodes => 
        prevNodes.map(node => 
          node.node_id === editNodeId 
            ? { ...node, node_name: newNodeName.trim() } 
            : node
        )
      );
      
      // 선택된 노드의 이름도 업데이트
      if (selectedNode && selectedNode.node_id === editNodeId) {
        selectNode({ ...selectedNode, node_name: newNodeName.trim() });
      }
      
      setEditNodeId(null);
      setNewNodeName('');
      
    } catch (err) {
      console.error('노드 이름 변경 실패:', err);
      setRenameError('노드 이름을 변경하지 못했습니다.');
    }
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
                <div key={node.node_id} className={styles.nodeItemContainer}>
                  {editNodeId === node.node_id ? (
                    // 편집 모드
                    <form onSubmit={saveNodeName} className={styles.nodeEditForm}>
                      <input
                        ref={inputRef}
                        type="text"
                        value={newNodeName}
                        onChange={(e) => setNewNodeName(e.target.value)}
                        className={styles.nodeNameInput}
                        autoFocus
                      />
                      <div className={styles.nodeEditButtons}>
                        <button
                          type="submit"
                          className={styles.saveButton}
                          title="저장"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className={styles.cancelButton}
                          title="취소"
                          onClick={cancelEditNodeName}
                        >
                          ✕
                        </button>
                      </div>
                      {renameError && <div className={styles.renameError}>{renameError}</div>}
                    </form>
                  ) : (
                    // 표시 모드
                    <Link 
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
                      <button 
                        className={styles.editNodeButton}
                        onClick={(e) => startEditNodeName(node, e)}
                        title="노드 이름 변경"
                      >
                        ✏️
                      </button>
                    </Link>
                  )}
                </div>
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