import { useEffect, useState, useRef } from 'react';
import api from '../../api';
import { getToken } from '../../utils/Auth';
import styles from '../../scss/user/Profile.module.scss';

type Profile = {
  sub: string;
  email: string;
  exp: number;
  obscura_key: string;
};

type Node = {
  id: string;
  name: string;
  status: 'active' | 'inactive' | string;
  statusValue?: number; // 상태 값(1: 활성, 0: 비활성)
};

// 모달 컴포넌트 인터페이스
interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
}

// 모달 컴포넌트
function Modal({ children, onClose }: ModalProps): React.ReactElement {
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalContent}>
        {children}
        <button className={styles.modalClose} onClick={onClose}></button>
      </div>
    </div>
  );
}

const donwloadurl = 'https://github.com/obscura-linux-monitoring/System-Monitor-Go/releases/latest/download/';

const Profile = () => {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [obscuraKey, setObscuraKey] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loadingNodes, setLoadingNodes] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyKeySuccess, setCopyKeySuccess] = useState(false);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const commandTextRef = useRef<HTMLTextAreaElement>(null);
  const keyTextRef = useRef<HTMLTextAreaElement>(null);

  // 노드 삭제 관련 상태
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);
  const [deletingNode, setDeletingNode] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api.get('/user/profile', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        setUser(res.data.user);
        setObscuraKey(res.data.obscura_key);

        // 사용자의 노드 목록 가져오기
        return api.get('/user/nodes', {
          params: {
            obscura_key: res.data.obscura_key
          },
          headers: {
            Authorization: `Bearer ${token}`,
          }
        });
      })
      .then((nodesRes) => {
        const data = nodesRes.data.nodes || [];

        let nodeList: Node[] = [];

        if (Array.isArray(data) && data.length > 0) {
          nodeList = data.map((node: any) => ({
            id: node.node_id || node.id,
            name: node.node_name || node.name || node.hostname || node.node_id || '알 수 없는 노드',
            status: node.status === 1 ? 'active' : 'inactive',
            statusValue: node.status
          }));
        }

        setNodes(nodeList);
        setLoadingNodes(false);
      })
      .catch((err) => {
        console.error('❌ 데이터 로딩 실패:', err);
        setError('데이터를 불러오는데 실패했습니다');
        setLoading(false);
        setLoadingNodes(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const copyToClipboard = () => {
    if (obscuraKey && commandTextRef.current) {
      // 숨겨진 텍스트 영역에 명령어 설정
      commandTextRef.current.value = `wget -O install.sh ${donwloadurl}install.sh && chmod +x install.sh && sudo ./install.sh ${obscuraKey}`;
      commandTextRef.current.select();

      try {
        // document.execCommand 사용 (더 넓은 브라우저 호환성)
        const successful = document.execCommand('copy');
        if (successful) {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        } else {
          console.error('복사 실패');
        }
      } catch (err) {
        console.error('복사 오류:', err);
      }

      // 선택 해제 (모바일에서 중요)
      window.getSelection()?.removeAllRanges();
    }
  };

  const copyObscuraKey = () => {
    if (obscuraKey && keyTextRef.current) {
      keyTextRef.current.value = obscuraKey;
      keyTextRef.current.select();

      try {
        const successful = document.execCommand('copy');
        if (successful) {
          setCopyKeySuccess(true);
          setTimeout(() => setCopyKeySuccess(false), 2000);
        } else {
          console.error('키 복사 실패');
        }
      } catch (err) {
        console.error('키 복사 오류:', err);
      }

      window.getSelection()?.removeAllRanges();
    }
  };

  const toggleNodeIdExpand = (nodeId: string) => {
    if (expandedNodeId === nodeId) {
      setExpandedNodeId(null);
    } else {
      setExpandedNodeId(nodeId);
    }
  };

  const copyNodeId = (nodeId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // 부모 요소의 클릭 이벤트 방지

    try {
      navigator.clipboard.writeText(nodeId).catch(() => {
        // 클립보드 API 실패 시 대체 방법
        const textArea = document.createElement('textarea');
        textArea.value = nodeId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      });

      // 복사 성공 표시 (필요하다면 상태 추가)
      alert('노드 ID가 클립보드에 복사되었습니다.');
    } catch (err) {
      console.error('ID 복사 오류:', err);
    }
  };

  // 노드 삭제 모달 열기
  const openDeleteModal = (node: Node, event: React.MouseEvent) => {
    event.stopPropagation(); // 부모 요소의 클릭 이벤트 방지
    setNodeToDelete(node);
    setDeleteModalVisible(true);
  };

  // 노드 삭제 처리
  const handleDeleteNode = async () => {
    if (!nodeToDelete || !obscuraKey) return;

    setDeletingNode(true);
    try {
      const response = await api.delete('/user/nodes/delete', {
        data: {
          node_id: nodeToDelete.id,
          obscura_key: obscuraKey
        }
      });

      if (response.data && response.data.message) {
        // 성공적으로 삭제됨
        // 노드 목록에서 삭제된 노드 제거
        setNodes(nodes.filter(node => node.id !== nodeToDelete.id));
        setDeleteModalVisible(false);
        setNodeToDelete(null);
      }
    } catch (error) {
      console.error('노드 삭제 실패:', error);
      alert('노드 삭제에 실패했습니다.');
    } finally {
      setDeletingNode(false);
    }
  };

  if (loading) return (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingSpinner}></div>
      <p>데이터를 불러오는 중...</p>
    </div>
  );

  if (!user) return (
    <div className={styles.errorContainer}>
      <div className={styles.errorIcon}>😥</div>
      <p>사용자 정보를 불러오지 못했습니다.</p>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.profileSection}>
        <div className={styles.sectionHeader}>
          <h2>🙋‍♂️ 사용자 프로필</h2>
        </div>

        <div className={styles.profileCard}>
          <div className={styles.profileItem}>
            <span className={styles.profileLabel}>ID</span>
            <span className={styles.profileValue}>{user.sub}</span>
          </div>

          <div className={styles.profileItem}>
            <span className={styles.profileLabel}>이메일</span>
            <span className={styles.profileValue}>{user.email}</span>
          </div>

          <div className={styles.profileItem}>
            <span className={styles.profileLabel}>JWT 만료 시각</span>
            <span className={styles.profileValue}>{new Date(user.exp * 1000).toLocaleString()}</span>
          </div>

          {obscuraKey && (
            <div className={styles.profileItem}>
              <span className={styles.profileLabel}>
                <span className={styles.keyIcon}>🔑</span> Obscura Key
              </span>
              <div className={styles.keyContainer}>
                <div className={`${styles.obscuraKey} ${copyKeySuccess ? styles.copied : ''}`} onClick={copyObscuraKey}>
                  <span className={styles.keyValue}>{obscuraKey}</span>
                  <span className={styles.keyCopyIndicator}>
                    {copyKeySuccess ? '복사됨!' : '클릭하여 복사'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.sectionHeader}>
          <h3># system-monitor</h3>
        </div>

        <div className={styles.installCommandContainer}>
          <div
            className={`${styles.installCommand} ${copySuccess ? styles.copied : ''}`}
            onClick={copyToClipboard}
          >
            <div className={styles.commandText}>
              wget -O install.sh {donwloadurl}install.sh && chmod +x install.sh && sudo ./install.sh {obscuraKey}
            </div>
            <div className={styles.copyIndicator}>
              {copySuccess ? '복사됨!' : '클릭하여 복사'}
            </div>
            <textarea
              ref={commandTextRef}
              className={styles.hiddenTextarea}
              readOnly
            />
          </div>
        </div>
      </div>

      <div className={styles.nodesSection}>
        <div className={styles.sectionHeader}>
          <h3>🖥️ 등록된 노드 목록</h3>
        </div>

        {loadingNodes ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <p>노드 정보를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className={styles.errorContainer}>
            <p>{error}</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className={styles.noNodes}>
            <div className={styles.emptyIcon}>📦</div>
            <p>등록된 노드가 없습니다.</p>
          </div>
        ) : (
          <div className={styles.nodesGrid}>
            {nodes.map((node) => (
              <div
                key={node.id}
                className={`${styles.nodeCard} ${expandedNodeId === node.id ? styles.expanded : ''}`}
                onClick={() => toggleNodeIdExpand(node.id)}
              >
                <h4>{node.name}</h4>
                <div className={`${styles.nodeIdContainer} ${expandedNodeId === node.id ? styles.expanded : ''}`}>
                  <div className={styles.nodeId}>
                    <span className={styles.nodeIdLabel}>ID:</span>
                    <span className={styles.nodeIdValue}>{node.id}</span>
                  </div>
                  {expandedNodeId === node.id && (
                    <button
                      className={styles.copyButton}
                      onClick={(e) => copyNodeId(node.id, e)}
                      title="ID 복사하기"
                    >
                      복사
                    </button>
                  )}
                </div>
                <div className={styles.nodeStatus}>
                  <span className={styles.statusLabel}>상태:</span>
                  <span className={`${styles.statusValue} ${node.status === 'active' ? styles.statusActive : styles.statusInactive}`}>
                    {node.status === 'active' ? '활성' : '비활성'}
                  </span>
                </div>

                {/* 삭제 버튼 추가 */}
                <button
                  className={styles.deleteButton}
                  onClick={(e) => openDeleteModal(node, e)}
                  title="노드 삭제하기"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 노드 삭제 확인 모달 */}
      {deleteModalVisible && nodeToDelete && (
        <Modal onClose={() => setDeleteModalVisible(false)}>
          <div className={styles.deleteModal}>
            <h3>노드 삭제</h3>
            <p>정말로 '{nodeToDelete.name}' 노드를 삭제하시겠습니까?</p>
            <p className={styles.warningText}>이 작업은 되돌릴 수 없으며, 노드 데이터가 모두 삭제됩니다.</p>

            <div className={styles.modalButtons}>
              <button
                className={styles.cancelButton}
                onClick={() => setDeleteModalVisible(false)}
                disabled={deletingNode}
              >
                취소
              </button>
              <button
                className={styles.deleteConfirmButton}
                onClick={handleDeleteNode}
                disabled={deletingNode}
              >
                {deletingNode ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 숨겨진 textarea를 컴포넌트 외부로 이동 */}
      <div style={{ display: 'none', position: 'absolute', left: '-9999px' }}>
        <textarea
          ref={keyTextRef}
          style={{ opacity: 0, position: 'absolute', pointerEvents: 'none' }}
          readOnly
        />
      </div>
    </div>
  );
};

export default Profile;