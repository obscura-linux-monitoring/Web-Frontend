import { Link } from 'react-router-dom';
import styles from '../scss/SideBar.module.scss';
import { useEffect, useState } from 'react';
import api from '../api';
import { getToken } from './utils/Auth';

type Node = {
  node_id: string;
  server_type: string;
};

const SideBar = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  
  // 사용자의 노드 목록을 가져오는 함수
  useEffect(() => {
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
      } catch (err) {
        console.error('노드 목록 로딩 실패:', err);
        setError('노드 목록을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchNodes();
  }, []);

  // 서브메뉴 토글 함수
  const toggleSubmenu = (e: React.MouseEvent) => {
    e.preventDefault(); // 기본 링크 이동 방지
    setIsSubmenuOpen(!isSubmenuOpen);
  };

  return (
    <div className={styles.sidebar}>
      <h3>🔧 메뉴</h3>
      <ul>
        <li><Link to="/">📊 대시보드</Link></li>
        
        <li className={`${styles.hasSubmenu} ${isSubmenuOpen ? styles.open : ''}`}>
          <a href="#" onClick={toggleSubmenu}>🧩 노드 목록</a>
          {isSubmenuOpen && (
            <div className={styles.submenu}>
              {loading ? (
                <div className={styles.submenuItem}>⏳ 로딩 중...</div>
              ) : error ? (
                <div className={styles.submenuItem}>❌ {error}</div>
              ) : nodes.length === 0 ? (
                <div className={styles.submenuItem}>등록된 노드가 없습니다</div>
              ) : (
                nodes.map(node => (
                  <Link 
                    key={node.node_id}
                    to={`/nodes/${node.node_id}`}
                    className={styles.submenuItem}
                  >
                    {node.server_type} - {node.node_id.substring(0, 8)}...
                  </Link>
                ))
              )}
            </div>
          )}
        </li>
        
        <li><Link to="/process">📊 프로세스</Link></li>
        <li><Link to="/settings">⚙️ 설정</Link></li>
      </ul>
    </div>
  );
};

export default SideBar;