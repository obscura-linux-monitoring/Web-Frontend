import { useEffect, useState } from 'react';
import api from '../api';
import { getToken } from '../components/utils/Auth';
import styles from '../scss/Profile.module.scss';
import NodeMetrics from './NodeMetrics';
import CommandForm from './CommandForm';

type UserProfile = {
  sub: string;
  email: string;
  exp: number;
  obscura_key: string;
};

type Node = {
  node_id: string;
  server_type: string;
};

const UserProfile = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [obscuraKey, setObscuraKey] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api.get('/protected/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => {
        setUser(res.data.user);
        setObscuraKey(res.data.obscura_key);
        setVersion(res.data.version);
        return api.get('/protected/nodes', {
          params: {
            obscura_key: res.data.obscura_key
          }
        });
      })
      .then((res) => {
        setNodes(res.data.nodes);
        setLoading(false);
      })
      .catch((err) => {
        console.error('❌ 데이터 로딩 실패:', err);
        setLoading(false);
      });
  }, []);

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId);
  };

  const handleCommandSuccess = () => {
    // 명령 등록 성공 후 필요한 작업 수행
    alert('명령이 성공적으로 등록되었습니다.');
  };

  if (loading) return <p>⏳ 로딩 중...</p>;
  if (!user) return <p>😥 사용자 정보를 불러오지 못했습니다.</p>;

  return (
    <div className={styles.container}>
      <div className={styles.profileSection}>
        <h2>🙋‍♂️ 사용자 프로필</h2>
        <p><strong>ID:</strong> {user.sub}</p>
        <p><strong>이메일:</strong> {user.email}</p>
        <p><strong>JWT토큰 만료 시각:</strong> {new Date(user.exp * 1000).toLocaleString()}</p>
        {obscuraKey && (
          <p><strong>🔑 Obscura Key:</strong> {obscuraKey}</p>
        )}
        <h3># system-monitor</h3>
        <p className={styles.installCommand}>
          wget -O install.sh https://github.com/obscura-linux-monitoring/System-Monitor/releases/download/{version}
          /install.sh && chmod +x install.sh && sudo ./install.sh {version} {obscuraKey}
        </p>
      </div>

      <div className={styles.nodesSection}>
        <h3>🖥️ 등록된 노드 목록</h3>
        {nodes.length === 0 ? (
          <p className={styles.noNodes}>등록된 노드가 없습니다.</p>
        ) : (
          <div className={styles.nodesGrid}>
            {nodes.map(node => (
              <div 
                key={node.node_id} 
                className={`${styles.nodeCard} ${selectedNodeId === node.node_id ? styles.selected : ''}`}
                onClick={() => handleNodeClick(node.node_id)}
              >
                <h4>{node.node_id}</h4>
                <p><strong>Type:</strong> {node.server_type}</p>
              </div>
            ))}
          </div>
        )}

        {selectedNodeId && (
          <div className={styles.metricsSection}>
            <NodeMetrics nodeId={selectedNodeId} />
            
            <div className={styles.commandSection}>
              <h3>🔧 명령 등록</h3>
              <CommandForm 
                onSubmitSuccess={handleCommandSuccess} 
                nodeId={selectedNodeId} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfile;