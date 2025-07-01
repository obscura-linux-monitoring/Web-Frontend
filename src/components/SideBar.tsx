import { Link, useLocation } from 'react-router-dom';
import styles from '../scss/SideBar.module.scss';
import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../api';
import { getToken } from '../utils/Auth';
import { useNodeContext } from '../context/NodeContext';
import { Modal, Button, Form, Select } from 'antd';

type Node = {
  node_id: string;
  server_type: string;
  status: number;
  node_name: string;
  teams?: Team[];
};

// 팀 타입 정의 추가
type Team = {
  team_id: string;
  team_name: string;
  owner_id: string;
  created_at: string;
  node_id: string;
  // 노드 관련 정보 추가
  node_name: string;
  node_status: number;
};

const SideBar = ({ isMobile, isSidebarOpen, setIsSidebarOpen }: { isMobile?: boolean, isSidebarOpen?: boolean, setIsSidebarOpen?: (open: boolean) => void }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectedNode, selectNode } = useNodeContext();
  const location = useLocation();
  const fetchedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const teamWsRef = useRef<WebSocket | null>(null); // 팀 WebSocket 참조 추가

  // 노드 이름 변경 관련 상태
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState<string>('');
  const [obscuraKey, setObscuraKey] = useState<string>('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 팀 관련 상태 추가 (팀 목록, 팀-노드 연결을 위한 상태만 유지)
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [teamModalVisible, setTeamModalVisible] = useState(false);
  const [currentNodeForTeam, setCurrentNodeForTeam] = useState<Node | null>(null);

  // 이 부분을 추가: 팀 확장 상태를 저장하는 state
  const [expandedTeams, setExpandedTeams] = useState<{[key: string]: boolean}>({});

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

        console.log("프로필 응답 데이터:", profileRes.data);
        const userObscuraKey = profileRes.data.obscura_key;
        setObscuraKey(userObscuraKey);

        // 노드 목록 가져오기 (초기 로딩용)
        const nodesRes = await api.get('/user/nodes', {
          params: {
            obscura_key: userObscuraKey
          }
        });
        setNodes(nodesRes.data.nodes);

        fetchedRef.current = true;

        // 노드 WebSocket 연결
        const nodeWs = new WebSocket(`ws://1.209.148.143:8000/user/ws/nodes?obscura_key=${userObscuraKey}&token=${token}`);
        
        nodeWs.onopen = () => {
          console.log('노드 WebSocket 연결 성공');
        };

        nodeWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'node_status_update') {
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

        nodeWs.onerror = (error) => {
          console.error('노드 WebSocket 오류:', error);
        };

        nodeWs.onclose = () => {
          console.log('노드 WebSocket 연결 종료');
        };

        wsRef.current = nodeWs;

        // 팀 WebSocket 연결 추가
        const teamWs = new WebSocket(`ws://1.209.148.143:8000/team/ws/teams_with_nodes?token=${token}`);
        
        teamWs.onopen = () => {
          console.log('팀 WebSocket 연결 성공');
        };

        teamWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('팀 WebSocket 데이터 수신:', data);

            if (data.type === 'teams_with_nodes_data') {
              setTeams(data.teams || []);
            }
          } catch (err) {
            console.error('팀 WebSocket 메시지 처리 오류:', err);
          }
        };

        teamWs.onerror = (error) => {
          console.error('팀 WebSocket 오류:', error);
        };

        teamWs.onclose = () => {
          console.log('팀 WebSocket 연결 종료');
        };

        teamWsRef.current = teamWs;

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
      if (teamWsRef.current) {
        teamWsRef.current.close();
      }
    };
  }, []);

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
      await api.patch('/user/nodes/rename', {
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

  // 노드에 팀 연결 모달 표시
  const showTeamModal = (node: Node) => {
    setCurrentNodeForTeam(node);

    // 현재 노드에 연결된 팀 ID 목록 가져오기
    const nodeTeams = node.teams?.map(team => team.team_id) || [];
    setSelectedTeams(nodeTeams);

    setTeamModalVisible(true);
  };

  // 노드에 팀 연결 저장
  const handleSaveTeamAssignment = async () => {
    if (!currentNodeForTeam) return;

    try {
      const token = getToken();
      await api.post(`/user/nodes/${currentNodeForTeam.node_id}/teams`, {
        team_ids: selectedTeams,
        obscura_key: obscuraKey
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // 노드 목록 갱신
      const updatedNodes = nodes.map(node => {
        if (node.node_id === currentNodeForTeam.node_id) {
          return {
            ...node,
            teams: teams.filter(team => selectedTeams.includes(team.team_id))
          };
        }
        return node;
      });

      setNodes(updatedNodes);
      console.log('팀 연결이 저장되었습니다.');
      setTeamModalVisible(false);
      
      // WebSocket에서 새로운 데이터가 자동으로 전송될 것이므로
      // 추가 요청은 필요 없음
    } catch (err) {
      console.error('팀 연결 저장 실패:', err);
    }
  };

  // 팀 클릭 시 확장/축소 토글 함수
  const toggleTeamExpand = (teamId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTeams(prev => ({
      ...prev,
      [teamId]: !prev[teamId]
    }));
  };

  // 팀이 관리하는 모든 노드 가져오기
  const getTeamNodes = (teamId: string) => {
    // 팀 ID로 필터링하고 노드 정보 추출
    return teams
      .filter(team => team.team_id === teamId && team.node_id && team.node_name)
      .map(team => ({
        node_id: team.node_id,
        node_name: team.node_name,
        node_status: team.node_status
      }));
  };

  // 고유한 팀 목록 추출 (중복 제거)
  const uniqueTeams = teams.reduce((acc, team) => {
    if (!acc.some(t => t.team_id === team.team_id)) {
      acc.push({
        team_id: team.team_id,
        team_name: team.team_name
      });
    }
    return acc;
  }, [] as {team_id: string, team_name: string}[]);

  // 오버레이 클릭 시 사이드바 닫기
  const handleOverlayClick = () => {
    if (setIsSidebarOpen) setIsSidebarOpen(false);
  };

  return (
    <>
      {/* 모바일에서만 오버레이 */}
      {isMobile && isSidebarOpen && (
        <div className={styles.overlay + ' ' + styles.visible} onClick={handleOverlayClick} />
      )}
      {/* 사이드바 */}
      <div className={styles.sidebar + (isMobile && isSidebarOpen ? ' ' + styles.open : '')}>
        {/* 모바일에서만 X 버튼 */}
        {isMobile && isSidebarOpen && setIsSidebarOpen && (
          <button
            className={styles.closeButton}
            onClick={handleOverlayClick}
            aria-label="메뉴 닫기"
          >
            ✕
          </button>
        )}
        {/* 사이드바 레이아웃을 main-content와 footer로 분리 */}
        <div className={styles.sidebarContent}>
          <h3><Link to="/">Obscura</Link></h3>
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
                        <div className={styles.nodeItemWrapper}>
                          <Link
                            to={`/nodes/monitoring/${node.node_id}`}
                            className={`${styles.nodeItem} ${selectedNode?.node_id === node.node_id ? styles.active : ''}`}
                            onClick={() => handleNodeSelect(node)}
                          >
                            {/* 노드 정보 영역 (왼쪽) */}
                            <span className={styles.nodeInfo}>
                              {getStatusIndicator(node.status)}
                              {node.node_name}
                              {node.status === 0 && (
                                <span className={styles.statusText}> (수집 중단)</span>
                              )}

                              {/* 팀 표시 추가 */}
                              {node.teams && node.teams.length > 0 && (
                                <span className={styles.teamBadge} title={`팀: ${node.teams.map(t => t.team_name).join(', ')}`}>
                                  👥 {node.teams.length}
                                </span>
                              )}
                            </span>

                            {/* 액션 버튼 영역 (오른쪽) */}
                            <div className={styles.nodeActions}>
                              <button
                                className={styles.editNodeButton}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  startEditNodeName(node, e);
                                }}
                                title="노드 이름 변경"
                              >
                                ✏️
                              </button>
                              <button
                                className={styles.teamNodeButton}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  showTeamModal(node);
                                }}
                                title="팀 관리"
                              >
                                👥
                              </button>
                            </div>
                          </Link>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </li>

            {/* 팀 관리 섹션 */}
            <li className={styles.teamsSection}>
              <div className={styles.teamListHeader}>
                <Link to="/team/management" className={styles.teamManagementLink}>
                  <span>👥 팀 관리</span>
                </Link>
              </div>
              <div className={styles.teamList}>
                {uniqueTeams.length === 0 ? (
                  <div className={styles.emptyTeam}>생성된 팀이 없습니다</div>
                ) : (
                  uniqueTeams.map((team) => {
                    // 팀이 관리하는 노드 목록
                    const teamNodes = getTeamNodes(team.team_id);
                    const isExpanded = expandedTeams[team.team_id] || false;
                    
                    return (
                      <div key={`team-${team.team_id}`} className={styles.teamContainer}>
                        {/* 팀 헤더 - 클릭 시 확장/축소 */}
                        <div 
                          className={styles.teamItem}
                          onClick={(e) => toggleTeamExpand(team.team_id, e)}
                        >
                          <div className={styles.teamContent}>
                            <div className={styles.teamName}>
                              <span className={styles.expandIcon}>
                                {isExpanded ? '▼' : '▶'}
                              </span>
                              👥 {team.team_name}
                            </div>
                            <div className={styles.teamNodeCount}>
                              {teamNodes.length > 0 
                                ? `${teamNodes.length}개 노드` 
                                : "연결된 노드 없음"}
                            </div>
                          </div>
                        </div>
                        
                        {/* 확장 시 노드 목록 표시 */}
                        {isExpanded && teamNodes.length > 0 && (
                          <div className={styles.teamNodesList}>
                            {teamNodes.map(node => (
                              <Link
                                key={`node-${node.node_id}`}
                                to={`/nodes/monitoring/${node.node_id}`}
                                className={`${styles.teamNodeItem} ${selectedNode?.node_id === node.node_id ? styles.active : ''}`}
                                onClick={() => handleNodeSelect({
                                  node_id: node.node_id,
                                  node_name: node.node_name,
                                  status: node.node_status,
                                  server_type: ''
                                })}
                              >
                                <div className={styles.nodeItemContent}>
                                  <span className={styles.nodeDot}>•</span>
                                  <span>{node.node_name}</span>
                                  <span className={node.node_status === 1 ? styles.activeNode : styles.inactiveNode}>
                                    {node.node_status === 1 ? '🟢' : '🔴'}
                                  </span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </li>
          </ul>
        </div>

        {/* 하단 고정 설정 메뉴 */}
        <div className={styles.sidebarFooter}>
          <Link to="/settings" className={styles.settingsLink}>⚙️ 설정</Link>
        </div>

        {/* 노드에 팀 연결 모달 */}
        <Modal
          title={`${currentNodeForTeam?.node_name || '노드'} 팀 관리`}
          open={teamModalVisible}
          onCancel={() => setTeamModalVisible(false)}
          footer={[
            <Button key="cancel" onClick={() => setTeamModalVisible(false)}>
              취소
            </Button>,
            <Button key="submit" type="primary" onClick={handleSaveTeamAssignment}>
              저장
            </Button>
          ]}
        >
          <Form layout="vertical">
            <Form.Item label="이 노드를 관리할 팀 선택:">
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="팀 선택"
                value={selectedTeams}
                onChange={setSelectedTeams}
                optionLabelProp="label"
              >
                {teams.map(team => (
                  <Select.Option key={team.team_id} value={team.team_id} label={team.team_name}>
                    {team.team_name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </>
  );
};

export default SideBar;