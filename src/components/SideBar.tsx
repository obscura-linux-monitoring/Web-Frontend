import { Link, useLocation } from 'react-router-dom';
import styles from '../scss/SideBar.module.scss';
import { useEffect, useState, useRef } from 'react';
import api from '../api';
import { getToken } from '../utils/Auth';
import { useNodeContext } from '../context/NodeContext';
import { Modal, Button, Form, Input, Select, Table, message } from 'antd';

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
};

// 팀 멤버 타입 정의
type TeamMember = {
  user_id: string;
  email: string;
  username: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
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
  
  // 팀 관련 상태 추가
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [teamModalVisible, setTeamModalVisible] = useState(false);
  const [createTeamModalVisible, setCreateTeamModalVisible] = useState(false);
  const [manageTeamModalVisible, setManageTeamModalVisible] = useState(false);
  const [currentNodeForTeam, setCurrentNodeForTeam] = useState<Node | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [selectedNodeForNewTeam, setSelectedNodeForNewTeam] = useState<string>('');
  
  // 상태에 google_id 추가 (기존 상태 변수 근처에 추가)
  const [googleId, setGoogleId] = useState<string>('');

  // 버튼 중복 클릭 방지를 위한 상태 추가
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        
        // profileRes.data에 들어있는 필드 확인을 위한 로깅
        console.log("프로필 응답 데이터:", profileRes.data);
        
        const userObscuraKey = profileRes.data.obscura_key;
        
        // 수정: google_id 대신 JWT 토큰 디코딩하여 sub 값 사용
        // JWT는 header.payload.signature 형태로 되어 있음
        const payload = token.split('.')[1];
        // base64 디코딩
        const decodedPayload = JSON.parse(atob(payload));
        const userGoogleId = decodedPayload.sub;
        
        console.log("토큰에서 가져온 Google ID (sub):", userGoogleId);
        
        setObscuraKey(userObscuraKey);
        setGoogleId(userGoogleId); // JWT의 sub 값을 googleId로 설정
        
        // 노드 목록 가져오기
        const nodesRes = await api.get('/user/nodes', {
          params: {
            obscura_key: userObscuraKey
          }
        });
        setNodes(nodesRes.data.nodes);
        
        // 팀 목록 가져오기 (추가)
        await fetchTeams();
        
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
  
  // 팀 목록 불러오기
  const fetchTeams = async () => {
    try {
      const token = getToken();
      const response = await api.get('/team/teams', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTeams(response.data.teams);
    } catch (err) {
      console.error('팀 목록 로딩 실패:', err);
    }
  };
  
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
      message.success('팀 연결이 저장되었습니다.');
      setTeamModalVisible(false);
    } catch (err) {
      console.error('팀 연결 저장 실패:', err);
      message.error('팀 연결을 저장하지 못했습니다.');
    }
  };
  
  // 팀 생성 모달 표시
  const showCreateTeamModal = () => {
    // 모달 열 때 노드 선택 상태 초기화
    setSelectedNodeForNewTeam('');
    setNewTeamName('');
    setCreateTeamModalVisible(true);
  };
  
  // 새 팀 생성
  const handleCreateTeam = async () => {
    if (isSubmitting) return; // 이미 요청 중이면 무시
    
    if (!newTeamName.trim()) {
      message.error('팀 이름을 입력해주세요.');
      return;
    }
    
    if (!selectedNodeForNewTeam) {
      message.error('노드를 선택해주세요.');
      return;
    }
    
    // googleId 유효성 검사 추가
    if (!googleId) {
      console.error('googleId가 없습니다. JWT 토큰에서 추출합니다.');
      
      // JWT에서 직접 sub 값 추출
      const token = getToken();
      if (!token) {
        message.error('인증 정보가 없습니다. 다시 로그인해주세요.');
        return;
      }
      
      try {
        const payload = token.split('.')[1];
        const decodedPayload = JSON.parse(atob(payload));
        setGoogleId(decodedPayload.sub);
        
        // 그래도 없으면 에러
        if (!decodedPayload.sub) {
          message.error('사용자 ID를 찾을 수 없습니다.');
          return;
        }
        
        console.log("JWT에서 직접 추출한 Google ID:", decodedPayload.sub);
      } catch (e) {
        message.error('인증 토큰이 유효하지 않습니다.');
        return;
      }
    }
    
    try {
      setIsSubmitting(true); // 요청 시작
      const token = getToken();
      
      const requestData = {
        google_id: googleId,
        team_name: newTeamName.trim(),
        node_id: selectedNodeForNewTeam
      };
      
      console.log("API 요청 데이터:", JSON.stringify(requestData));
      
      const response = await api.post('/team/create', requestData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // 나머지 코드는 동일
      const newTeam = response.data.team;
      // node_id가 있는지 확인하고 추가
      if (!newTeam.node_id && selectedNodeForNewTeam) {
        newTeam.node_id = selectedNodeForNewTeam;
      }
      setTeams([...teams, newTeam]);
      
      // 선택된 노드에 팀 연결 정보 업데이트
      setNodes(prevNodes => 
        prevNodes.map(node => 
          node.node_id === selectedNodeForNewTeam
            ? { 
                ...node, 
                teams: [...(node.teams || []), newTeam]
              } 
            : node
        )
      );
      
      message.success('새 팀이 생성되었습니다.');
      setNewTeamName('');
      setSelectedNodeForNewTeam('');
      setCreateTeamModalVisible(false);
    } catch (err: any) {
      // 오류 응답 더 자세히 로깅
      console.error('팀 생성 실패:', err);
      if (err?.response) {
        console.error('응답 데이터:', err.response.data);
        console.error('응답 상태:', err.response.status);
      }
      message.error('팀을 생성하지 못했습니다. 개발자 콘솔을 확인하세요.');
    } finally {
      setIsSubmitting(false); // 요청 완료 후 상태 변경
    }
  };
  
  // 팀 관리 모달 표시
  const showManageTeamModal = async (team: Team) => {
    setSelectedTeam(team);
    
    try {
      const token = getToken();
      const response = await api.get(`/user/teams/${team.team_id}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setTeamMembers(response.data.members);
      setManageTeamModalVisible(true);
    } catch (err) {
      console.error('팀 멤버 조회 실패:', err);
      message.error('팀 멤버 정보를 불러오지 못했습니다.');
    }
  };
  
  // 팀원 초대
  const handleInviteMember = async () => {
    if (!selectedTeam || !newMemberEmail.trim()) return;
    
    try {
      const token = getToken();
      await api.post(`/user/teams/${selectedTeam.team_id}/members`, {
        email: newMemberEmail.trim(),
        role: 'member',
        obscura_key: obscuraKey
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // 멤버 목록 갱신
      const response = await api.get(`/user/teams/${selectedTeam.team_id}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setTeamMembers(response.data.members);
      setNewMemberEmail('');
      message.success('팀원이 초대되었습니다.');
    } catch (err) {
      console.error('팀원 초대 실패:', err);
      message.error('팀원을 초대하지 못했습니다.');
    }
  };
  
  // 팀원 제거
  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeam) return;
    
    try {
      const token = getToken();
      await api.delete(`/user/teams/${selectedTeam.team_id}/members/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // 멤버 목록에서 제거
      setTeamMembers(teamMembers.filter(member => member.user_id !== userId));
      message.success('팀원이 제거되었습니다.');
    } catch (err) {
      console.error('팀원 제거 실패:', err);
      message.error('팀원을 제거하지 못했습니다.');
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
                    <div className={styles.nodeItemWrapper}>
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
                          
                          {/* 팀 표시 추가 */}
                          {node.teams && node.teams.length > 0 && (
                            <span className={styles.teamBadge} title={`팀: ${node.teams.map(t => t.team_name).join(', ')}`}>
                              👥 {node.teams.length}
                            </span>
                          )}
                        </span>
                        
                        <div className={styles.nodeActions}>
                          <button 
                            className={styles.editNodeButton}
                            onClick={(e) => startEditNodeName(node, e)}
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
        
        {/* 팀 관리 메뉴 추가 */}
        <li className={styles.teamsSection}>
          <div className={styles.teamListHeader}>
            👥 팀 관리
            <button 
              className={styles.createTeamButton}
              onClick={() => showCreateTeamModal()}
              title="새 팀 만들기"
            >
              ➕
            </button>
          </div>
          <div className={styles.teamList}>
            {teams.length === 0 ? (
              <div className={styles.emptyTeam}>생성된 팀이 없습니다</div>
            ) : (
              teams.map(team => {
                // 해당 node_id에 매칭되는 노드 찾기
                const managedNode = nodes.find(node => node.node_id === team.node_id);
                
                return (
                  <div 
                    key={team.team_id} 
                    className={styles.teamItem}
                    onClick={() => showManageTeamModal(team)}
                  >
                    <div className={styles.teamName}>
                      👥 {team.team_name}
                    </div>
                    {managedNode && (
                      <div className={styles.teamNodeInfo}>
                        <span title="관리 노드">🔗 {managedNode.node_name}</span>
                        <span className={managedNode.status === 1 ? styles.activeNode : styles.inactiveNode}>
                          {managedNode.status === 1 ? '🟢' : '🔴'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </li>
        
        <li><Link to="/settings">⚙️ 설정</Link></li>
      </ul>
      
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
          </Button>,
        ] as React.ReactNode[]}
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
      
      {/* 팀 생성 모달 */}
      <Modal
        title="새 팀 만들기"
        open={createTeamModalVisible}
        onCancel={() => setCreateTeamModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setCreateTeamModalVisible(false)}>
            취소
          </Button>,
          <Button key="submit" type="primary" onClick={handleCreateTeam}>
            생성
          </Button>,
        ] as React.ReactNode[]}
      >
        <Form layout="vertical">
          <Form.Item label="팀 이름" required>
            <Input
              placeholder="팀 이름 입력"
              value={newTeamName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTeamName(e.target.value)}
              maxLength={30}
            />
          </Form.Item>
          
          <Form.Item label="관리할 노드 선택" required> {/* required 추가 */}
            <Select
              style={{ width: '100%' }}
              placeholder="관리할 노드 선택"
              value={selectedNodeForNewTeam}
              onChange={setSelectedNodeForNewTeam}
              optionLabelProp="label"
              // allowClear 제거 (필수 선택이므로)
            >
              {nodes.map(node => (
                <Select.Option key={node.node_id} value={node.node_id} label={node.node_name}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: '8px' }}>
                      {node.status === 1 ? '🟢' : '🔴'}
                    </span>
                    {node.node_name}
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
      
      {/* 팀 관리 모달 */}
      <Modal
        title={`팀 관리: ${selectedTeam?.team_name || ''}`}
        open={manageTeamModalVisible}
        onCancel={() => setManageTeamModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setManageTeamModalVisible(false)}>
            닫기
          </Button>,
        ] as React.ReactNode[]}
        width={700}
      >
        <div className={styles.inviteSection}>
          <h4>새 팀원 초대</h4>
          <div className={styles.inviteForm}>
            <Input
              placeholder="이메일 주소 입력"
              value={newMemberEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMemberEmail(e.target.value)}
              style={{ width: '70%' }}
            />
            <Button type="primary" onClick={handleInviteMember}>초대</Button>
          </div>
        </div>
        
        <h4>팀원 목록</h4>
        <Table<TeamMember>
          dataSource={teamMembers}
          rowKey="user_id"
          size="small"
          pagination={false}
          columns={[
            {
              title: '이메일',
              dataIndex: 'email',
              key: 'email',
            },
            {
              title: '이름',
              dataIndex: 'username',
              key: 'username',
            },
            {
              title: '역할',
              dataIndex: 'role',
              key: 'role',
              render: (role: 'owner' | 'admin' | 'member') => {
          switch(role) {
            case 'owner': return '소유자';
            case 'admin': return '관리자';
            default: return '멤버';
          }
              }
            },
            {
              title: '작업',
              key: 'action',
              render: (_: unknown, record: TeamMember) => (
                <Button 
                  danger 
                  size="small" 
                  disabled={record.role === 'owner'}
                  onClick={() => handleRemoveMember(record.user_id)}
                >
                  제거
                </Button>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default SideBar;