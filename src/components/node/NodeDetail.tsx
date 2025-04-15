import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from '../../scss/node/NodeDetail.module.scss';
import NodeMetrics from '../node/NodeMetrics';
import CommandForm from '../node/CommandForm';
import api from '../../api';
import { getToken, getUserInfo } from '../utils/Auth'; // getUserInfo 추가
import ProcessView from './ProcessView';

type Node = {
  node_id: string;
  server_type: string;
  last_seen?: string;
  status?: string;
};

const NodeDetail = () => {
  const { nodeId } = useParams<{ nodeId: string }>();
  const [node, setNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const navigate = useNavigate();

  // 불필요한 /user/profile API 호출 제거
  useEffect(() => {
    const fetchNodeDetails = async () => {
      if (!nodeId) return;

      const token = getToken();
      if (!token) {
        navigate('/');
        return;
      }

      setLoading(true);
      try {
        // 로컬 스토리지나 세션에서 직접 obscura_key를 가져오는 방식으로 변경
        const userInfo = getUserInfo();
        const obscuraKey = userInfo?.obscura_key; // getUserInfo에서 obscura_key도 함께 가져오도록 수정 필요
        
        // 만약 getUserInfo에서 obscura_key를 직접 얻을 수 없다면 아래와 같이 필요한 경우만 API 호출
        let obscuraKeyToUse = obscuraKey;
        if (!obscuraKeyToUse) {
          // obscura_key가 필요한데 없을 경우에만 API 호출
          const profileRes = await api.get('/user/profile', {
            headers: {
              Authorization: `Bearer ${token}`,
            }
          });
          obscuraKeyToUse = profileRes.data.obscura_key;
        }
        
        // 노드 목록에서 해당 노드 찾기
        const nodesRes = await api.get('/user/nodes', {
          params: {
            obscura_key: obscuraKeyToUse
          }
        });
        
        const foundNode = nodesRes.data.nodes.find((n: Node) => n.node_id === nodeId);
        if (foundNode) {
          setNode(foundNode);
          setSelectedNodeId(foundNode.node_id);
        } else {
          setError('노드를 찾을 수 없습니다.');
        }
      } catch (err) {
        console.error('노드 정보 로딩 실패:', err);
        setError('노드 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchNodeDetails();
  }, [nodeId, navigate]);

  const handleCommandSuccess = () => {
    alert('명령이 성공적으로 등록되었습니다.');
  };

  if (loading) return <div className={styles.loadingContainer}><p>⏳ 노드 정보 로딩 중...</p></div>;
  if (error) return <div className={styles.errorContainer}><p>❌ {error}</p></div>;
  if (!node) return <div className={styles.errorContainer}><p>😥 노드 정보를 찾을 수 없습니다.</p></div>;

  return (
    <div className={styles.container}>
      <div className={styles.nodeHeader}>
        <h2>🖥️ {node.server_type} 노드</h2>
        <div className={styles.nodeId}>ID: {node.node_id}</div>
        {node.last_seen && (
          <div className={styles.nodeMeta}>
            마지막 접속: {new Date(node.last_seen).toLocaleString()}
          </div>
        )}
        {node.status && (
          <div className={`${styles.nodeStatus} ${styles[node.status.toLowerCase()]}`}>
            상태: {node.status}
          </div>
        )}
      </div>

      {selectedNodeId && (
        <div className={styles.metricsSection}>
          <h3>📊 노드 메트릭</h3>
          <NodeMetrics nodeId={selectedNodeId} />
          
          <div className={styles.commandSection}>
            <h3>🔧 명령 등록</h3>
            <CommandForm 
              onSubmitSuccess={handleCommandSuccess} 
              nodeId={selectedNodeId} 
            />
          </div>
          <div>
            <ProcessView nodeId={selectedNodeId} />
          </div>
        </div>
      )}
    </div>
  );
};

export default NodeDetail;