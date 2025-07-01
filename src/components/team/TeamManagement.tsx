import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getToken, getUserInfo, getUserProfileImage } from '../../utils/Auth';
import api from '../../api';
import styles from '../../scss/team/TeamManagement.module.scss';
import '../../scss/team/team_mobile/TeamManagement.module.mobile.scss';
// Ant Design 컴포넌트 추가
import { Modal, Button, Form, Input, Select, message, AutoComplete } from 'antd';
import EventBus from '../../utils/EventBus';

// 팀 타입 정의 추가
type Team = {
  team_id: string;
  team_name: string;
  google_id: string;
  created_at: string;
  node_id: string;
  abbreviation?: string;  // 추가: abbreviation 속성
};

// TeamMember 타입 정의를 백엔드 쿼리와 일치하도록 수정
type TeamMember = {
  google_id: string;  // user_id 대신 google_id로 변경
  email: string;
  name: string;      // username 대신 name으로 변경 (백엔드 SQL 쿼리와 일치)
  role: string;      // 'owner' | 'admin' | 'member' 대신 string으로 변경
  is_creator?: boolean; // 백엔드에 없으나 UI 용도로 유지
};

// 노드 인터페이스 추가
interface Node {
  node_id: string;
  node_name: string;
  description?: string;
  status?: string;
  ip_address?: string;
}

const TeamManagement: React.FC = () => {
  const profileImageUrl = getUserProfileImage();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teamNodes, setTeamNodes] = useState<Node[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]); // 모든 노드 목록 추가
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [formData, setFormData] = useState({ team_name: '', description: '' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 이메일 자동완성을 위한 상태 추가
  const [emailOptions, setEmailOptions] = useState<Array<{ value: string; label: React.ReactNode }>>([]);
  const [searchingEmail, setSearchingEmail] = useState(false);
  
  // 팀 생성 모달을 위한 상태 추가
  const [createTeamModalVisible, setCreateTeamModalVisible] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedNodeForNewTeam, setSelectedNodeForNewTeam] = useState<string>('');
  
  // 노드 추가 모달을 위한 상태 추가
  const [addNodeModalVisible, setAddNodeModalVisible] = useState(false);
  const [selectedNodeForTeam, setSelectedNodeForTeam] = useState<string>('');
  const [addingNode, setAddingNode] = useState(false);
  
  // 팀 삭제 및 탈퇴 관련 상태 추가
  const [deleteTeamModalVisible, setDeleteTeamModalVisible] = useState(false);
  const [removeNodeModalVisible, setRemoveNodeModalVisible] = useState(false);
  const [nodeToRemove, setNodeToRemove] = useState<Node | null>(null);
  const [leaveTeamModalVisible, setLeaveTeamModalVisible] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);
  
  const modalRef = useRef<HTMLDivElement>(null);
  const params = useParams();
  const userInfo = getUserInfo();
  const googleId = userInfo?.id || '';
  
  // 현재 사용자가 관리자인지 확인하는 함수
  const isCurrentUserAdmin = () => {
    if (!selectedTeam || !userInfo?.id) return false;
    
    const currentUser = members.find(member => member.google_id === userInfo.id);
    const isAdmin = currentUser?.role === 'admin';
    
    console.log('권한 체크:', { 
      userId: userInfo.id,
      userRole: currentUser?.role,
      isAdmin
    });
    
    return isAdmin;
  };
  
  // 모든 노드 가져오기
  const fetchNodes = async () => {
    try {
      const token = getToken();
      if (!token) return;
      
      // 사용자 프로필 정보를 가져와서 obscura_key 얻기
      const profileRes = await api.get('/user/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      const userObscuraKey = profileRes.data.obscura_key;
      
      if (!userObscuraKey) {
        console.error('사용자의 obscura_key를 찾을 수 없습니다.');
        showError('사용자 정보를 불러올 수 없습니다.');
        return;
      }
      
      // 얻은 obscura_key로 노드 목록 API 호출
      const nodesRes = await api.get('/user/nodes', {
        params: { obscura_key: userObscuraKey }
      });
      
      setNodes(nodesRes.data.nodes || []);
    } catch (error) {
      console.error('노드 목록 가져오기 오류:', error);
      showError('노드 정보를 불러오는 데 실패했습니다.');
    }
  };
  
  // 팀 목록 가져오기
  const fetchTeams = async () => {
    try {
      const token = getToken();
      if (!token) return;
      
      setLoading(true);
      const response = await api.get('/team/teams', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // 이미지에 맞게 각 팀에 약자 추가
      const teamsWithAbbreviation = (response.data.teams || []).map((team: Team) => ({
        ...team,
        abbreviation: team.team_name.charAt(0).toUpperCase()
      }));
      
      setTeams(teamsWithAbbreviation);
      
      // 첫 번째 팀 선택 또는 URL에서 팀 ID 가져오기
      const teamId = params.teamId || (teamsWithAbbreviation[0]?.team_id || null);
      setSelectedTeam(teamId);
      
      if (teamId) {
        fetchTeamMembers(teamId);
        fetchTeamNodes(teamId);
      }
    } catch (error) {
      console.error('팀 목록 가져오기 오류:', error);
      showError('팀 정보를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };
  
  // 선택한 팀의 멤버 가져오기
  const fetchTeamMembers = async (teamId: string) => {
    if (!teamId) return;
    
    try {
      const token = getToken();
      if (!token) return;
      
      const response = await api.get(`/team/members/${teamId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(response.data.members);
      
      const membersData = response.data.members || [];
      
      const membersWithCreator = membersData.map((member: any) => ({
        ...member,
        is_creator: false // 기본값 설정
      }));
      
      setMembers(membersWithCreator);
    } catch (error) {
      console.error('팀 멤버 가져오기 오류:', error);
      showError('팀 멤버 정보를 불러오는 데 실패했습니다.');
    }
  };
  
  // 팀 노드 가져오기 함수 추가
  const fetchTeamNodes = async (teamId: string) => {
    if (!teamId) return;
    
    try {
      const token = getToken();
      if (!token) return;
      
      const response = await api.get(`/team/nodes/${teamId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setTeamNodes(response.data.nodes || []);
    } catch (error) {
      console.error('팀 노드 가져오기 오류:', error);
      showError('팀 노드 정보를 불러오는 데 실패했습니다.');
    }
  };
  
  // 팀 선택
  const handleTeamSelect = (teamId: string) => {
    setSelectedTeam(teamId);
    fetchTeamMembers(teamId);
    fetchTeamNodes(teamId);
  };
  
  // 이메일 검색 함수 (자동완성 기능)
  const handleEmailSearch = async (value: string) => {
    if (!value || value.length < 2) {
      setEmailOptions([]);
      return;
    }

    try {
      setSearchingEmail(true);
      const token = getToken();
      const response = await api.get('/user/search_emails', {
        params: { query: value },
        headers: { Authorization: `Bearer ${token}` }
      });

      // 서버에서 받은 이메일 목록으로 자동완성 옵션 설정
      const options = response.data.users?.map((user: any) => ({
        value: user.email,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{user.email}</span>
            <span style={{ color: '#999' }}>{user.name}</span>
          </div>
        )
      })) || [];

      setEmailOptions(options);
    } catch (err) {
      console.error('이메일 검색 중 오류:', err);
    } finally {
      setSearchingEmail(false);
    }
  };
  
  // 팀원 초대
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam || !inviteEmail.trim()) {
      showError('이메일 주소를 입력해주세요.');
      return;
    }
    
    try {
      const token = getToken();
      
      // 이메일로 사용자 ID 찾기
      const userResponse = await api.get(`/user/find_by_email`, {
        params: { email: inviteEmail.trim() },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!userResponse.data?.user?.google_id) {
        showError('해당 이메일로 등록된 사용자를 찾을 수 없습니다.');
        return;
      }
      
      const receiverId = userResponse.data.user.google_id;
      
      // 초대 생성 API 호출
      await api.post(`/team/invite_user`, {
        team_id: selectedTeam,
        receiver_id: receiverId,
        role: 'member'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      showSuccess('팀원 초대가 성공적으로 생성되었습니다.');
      setInviteEmail('');
      setIsModalVisible(false);
      
      // 멤버 목록 새로고침
      fetchTeamMembers(selectedTeam);
    } catch (error) {
      console.error('팀원 초대 오류:', error);
      showError('팀원 초대에 실패했습니다.');
    }
  };
  
  // 새 팀 생성 모달 표시
  const showCreateTeamModal = async () => {
    setSelectedNodeForNewTeam('');
    setNewTeamName('');
    
    try {
      const token = getToken();
      if (!token) return;
      
      console.log('노드 목록을 가져오는 중...');
      
      // 1. 먼저 사용자 프로필 정보를 가져와서 obscura_key 얻기
      const profileRes = await api.get('/user/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      console.log("프로필 응답 데이터:", profileRes.data);
      const userObscuraKey = profileRes.data.obscura_key;
      
      if (!userObscuraKey) {
        console.error('사용자의 obscura_key를 찾을 수 없습니다.');
        showError('사용자 정보를 불러올 수 없습니다.');
        return;
      }
      
      // 2. 얻은 obscura_key로 노드 목록 API 호출
      const nodesRes = await api.get('/user/nodes', {
        params: { obscura_key: userObscuraKey }
      });
      
      console.log('노드 API 응답:', nodesRes.data);
      setNodes(nodesRes.data.nodes || []);
      
      // 3. 노드 데이터가 있는 경우에만 모달 표시
      if (nodesRes.data.nodes && nodesRes.data.nodes.length > 0) {
        setCreateTeamModalVisible(true);
      } else {
        showError('관리할 수 있는 노드가 없습니다. 먼저 노드를 생성해주세요.');
      }
    } catch (error) {
      console.error('노드 목록 가져오기 오류:', error);
      
      // if (error.response) {
      //   console.error('오류 응답:', error.response.status, error.response.data);
      // }
      
      showError('노드 정보를 불러오는 데 실패했습니다.');
    }
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

    // googleId 유효성 검사
    if (!googleId) {
      message.error('사용자 ID를 찾을 수 없습니다. 다시 로그인해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      const token = getToken();

      const requestData = {
        google_id: googleId,
        team_name: newTeamName.trim(),
        node_id: selectedNodeForNewTeam
      };

      console.log("팀 생성 API 요청 데이터:", JSON.stringify(requestData));

      const response = await api.post('/team/create', requestData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // 새 팀 정보에 abbreviation 추가
      const newTeam = {
        ...response.data.team,
        abbreviation: newTeamName.trim().charAt(0).toUpperCase(),
      };
      
      // 팀 목록에 추가
      setTeams([...teams, newTeam]);

      message.success('새 팀이 생성되었습니다.');
      setNewTeamName('');
      setSelectedNodeForNewTeam('');
      setCreateTeamModalVisible(false);
      
      // 새로 생성된 팀 선택
      setSelectedTeam(newTeam.team_id);
      fetchTeamMembers(newTeam.team_id);
      fetchTeamNodes(newTeam.team_id);
      
      // 이벤트 발행 - SideBar 컴포넌트에 알림
      EventBus.publish('team-nodes-updated');
      
    } catch (err: any) {
      console.error('팀 생성 실패:', err);
      if (err?.response) {
        console.error('응답 데이터:', err.response.data);
        message.error(`팀 생성 실패: ${err.response.data.detail || '알 수 없는 오류'}`);
      } else {
        message.error('팀을 생성하지 못했습니다.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 노드 추가 모달 표시
  const showAddNodeModal = () => {
    setSelectedNodeForTeam('');
    setAddNodeModalVisible(true);
  };

  // 선택한 노드를 팀에 추가
  const handleAddNodeToTeam = async () => {
    if (!selectedTeam || !selectedNodeForTeam || addingNode) return;

    try {
      setAddingNode(true);
      const token = getToken();
      
      await api.post(`/team/nodes/add`, 
        {
          team_id: selectedTeam,
          node_id: selectedNodeForTeam
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      // 성공 메시지 표시
      showSuccess('팀에 노드가 성공적으로 추가되었습니다.');
      
      // 모달 닫기 및 상태 초기화
      setAddNodeModalVisible(false);
      setSelectedNodeForTeam('');
      
      // 팀 노드 목록 새로고침
      fetchTeamNodes(selectedTeam);
      
      // 이벤트 발행 - SideBar 컴포넌트에 알림
      console.log('노드 추가 완료: 이벤트 발행');
      EventBus.publish('team-nodes-updated');
      
    } catch (err: any) {
      console.error('팀에 노드 추가 실패:', err);
      if (err?.response) {
        showError(`노드 추가 실패: ${err.response.data.detail || '알 수 없는 오류'}`);
      } else {
        showError('팀에 노드를 추가하지 못했습니다.');
      }
    } finally {
      setAddingNode(false);
    }
  };
  
  // 팀 삭제 함수 (관리자만 가능)
  const handleDeleteTeam = async () => {
    if (!selectedTeam || !isCurrentUserAdmin() || processingAction) return;
    
    try {
      setProcessingAction(true);
      const token = getToken();
      
      await api.delete(`/team/delete/${selectedTeam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // 팀 목록에서 제거
      setTeams(teams.filter(team => team.team_id !== selectedTeam));
      setDeleteTeamModalVisible(false);
      
      // 다른 팀 선택 또는 선택 해제
      const remainingTeam = teams.find(team => team.team_id !== selectedTeam);
      if (remainingTeam) {
        setSelectedTeam(remainingTeam.team_id);
        fetchTeamMembers(remainingTeam.team_id);
        fetchTeamNodes(remainingTeam.team_id);
      } else {
        setSelectedTeam(null);
        setMembers([]);
        setTeamNodes([]);
      }
      
      showSuccess('팀이 성공적으로 삭제되었습니다.');
      
      // 이벤트 발행 - SideBar 컴포넌트에 알림
      EventBus.publish('team-nodes-updated');
      
    } catch (error) {
      console.error('팀 삭제 오류:', error);
      showError('팀 삭제에 실패했습니다.');
    } finally {
      setProcessingAction(false);
    }
  };
  
  // 팀에서 노드 제거 함수 (관리자만 가능)
  const handleRemoveNode = async () => {
    if (!selectedTeam || !nodeToRemove || !isCurrentUserAdmin() || processingAction) return;
    
    try {
      setProcessingAction(true);
      const token = getToken();
      
      await api.delete(`/team/nodes/remove`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          team_id: selectedTeam,
          node_id: nodeToRemove.node_id
        }
      });
      
      // 노드 목록 업데이트
      setTeamNodes(teamNodes.filter(node => node.node_id !== nodeToRemove.node_id));
      setRemoveNodeModalVisible(false);
      setNodeToRemove(null);
      
      showSuccess('노드가 팀에서 성공적으로 제거되었습니다.');
      
      // 이벤트 발행 - SideBar 컴포넌트에 알림
      EventBus.publish('team-nodes-updated');
      
    } catch (error) {
      console.error('노드 제거 오류:', error);
      showError('노드 제거에 실패했습니다.');
    } finally {
      setProcessingAction(false);
    }
  };
  
  // 팀 탈퇴 함수 (일반 회원도 가능)
  const handleLeaveTeam = async () => {
    console.log("🔍 handleLeaveTeam 함수 호출됨");
  
    if (!selectedTeam) {
      console.log("❌ 선택된 팀이 없음:", selectedTeam);
      return;
    }
    
    if (!userInfo?.id) {
      console.log("❌ 사용자 정보 없음:", userInfo);
      return;
    }
    
    if (processingAction) {
      console.log("❌ 이미 처리 중:", processingAction);
      return;
    }
    
    console.log("✅ 기본 검증 통과");
    console.log("현재 멤버 목록:", members);
    console.log("현재 사용자 ID:", userInfo.id);
    
    // 팀 소유자는 탈퇴 불가
    const currentUser = members.find(member => member.google_id === userInfo.id);
    console.log("찾은 현재 사용자 정보:", currentUser);
    
    // alert 대신 console.log로 먼저 확인
    console.log(`현재 사용자: ${currentUser?.name}, 역할: ${currentUser?.role}`);
    
    // alert 함수를 setTimeout으로 감싸기
    setTimeout(() => {
      // alert(`현재 사용자: ${currentUser?.name}, 역할: ${currentUser?.role}`);
    }, 100);
    
    if (currentUser?.role === 'admin') {  // 'admin'이 아닌 'owner'로 변경
      showError('팀 소유자는 팀을 탈퇴할 수 없습니다. 팀을 삭제하거나 소유권을 이전하세요.');
      return;
    }
    
    try {
      setProcessingAction(true);
      const token = getToken();
      
      await api.delete(`/team/leave/${selectedTeam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // 팀 목록에서 제거
      setTeams(teams.filter(team => team.team_id !== selectedTeam));
      setLeaveTeamModalVisible(false);
      
      // 다른 팀 선택 또는 선택 해제
      const remainingTeam = teams.find(team => team.team_id !== selectedTeam);
      if (remainingTeam) {
        setSelectedTeam(remainingTeam.team_id);
        fetchTeamMembers(remainingTeam.team_id);
        fetchTeamNodes(remainingTeam.team_id);
      } else {
        setSelectedTeam(null);
        setMembers([]);
        setTeamNodes([]);
      }
      
      showSuccess('성공적으로 팀에서 탈퇴했습니다.');
    } catch (error) {
      console.error('팀 탈퇴 오류:', error);
      showError('팀 탈퇴에 실패했습니다.');
    } finally {
      setProcessingAction(false);
    }
  };
  
  // 노드 제거 모달 표시
  const showRemoveNodeModal = (node: Node) => {
    setNodeToRemove(node);
    setRemoveNodeModalVisible(true);
  };

  // 이미 팀에 추가된 노드 ID 목록 생성 함수
  const getTeamNodeIds = () => {
    return teamNodes.map(node => node.node_id);
  };

  // 현재 팀에 추가 가능한 노드 필터링
  const getAvailableNodes = () => {
    const teamNodeIds = getTeamNodeIds();
    return nodes.filter(node => !teamNodeIds.includes(node.node_id));
  };
  
  // 관리자 권한 설정/해제
  const handleRoleChange = async (memberId: string, isAdmin: boolean) => {
    if (!selectedTeam || !isCurrentUserAdmin()) {
      showError('권한이 없습니다. 관리자만 역할을 변경할 수 있습니다.');
      return;
    }
    
    try {
      const token = getToken();
      // 쿼리 파라미터 대신 요청 본문 사용
      const role = isAdmin ? 'admin' : 'user';
      await api.put(`/team/${selectedTeam}/member/${memberId}/role`, { role }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // 멤버 목록 업데이트
      fetchTeamMembers(selectedTeam);
      showSuccess(`사용자 권한이 ${isAdmin ? '관리자' : '일반 멤버'}로 변경되었습니다.`);
    } catch (error: any) {
      console.error('권한 변경 오류:', error);
      
      // 권한 오류 메시지 구체화
      if (error?.response?.status === 403) {
        showError('관리자만 권한을 변경할 수 있습니다.');
      } else {
        showError('권한 변경에 실패했습니다.');
      }
      
      // 체크박스 상태 되돌리기 (UI 정합성 유지)
      fetchTeamMembers(selectedTeam);
    }
  };
  
  // CREATOR 권한 설정/해제
  // const handleCreatorChange = async (memberId: string, isCreator: boolean) => {
  //   if (!selectedTeam) return;
    
  //   try {
  //     const token = getToken();
  //     await api.put(`/team/${selectedTeam}/member/${memberId}/creator`, {
  //       is_creator: isCreator
  //     }, {
  //       headers: { Authorization: `Bearer ${token}` }
  //     });
      
  //     // 멤버 목록 업데이트
  //     fetchTeamMembers(selectedTeam);
  //     showSuccess(`사용자 ${isCreator ? 'CREATOR 권한이 부여' : 'CREATOR 권한이 제거'}되었습니다.`);
  //   } catch (error) {
  //     console.error('CREATOR 권한 변경 오류:', error);
  //     showError('CREATOR 권한 변경에 실패했습니다.');
  //   }
  // };
  
  // 알림 표시 함수
  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 3000);
  };
  
  const showSuccess = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3000);
  };
  
  // 모달 외부 클릭 감지
  const handleClickOutside = (e: MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      setIsModalVisible(false);
    }
  };

  // 컴포넌트 마운트 시 데이터 가져오기
  useEffect(() => {
    fetchNodes(); // 모든 노드 가져오기
    fetchTeams(); // 팀 목록 가져오기
    
    // 모달 외부 클릭 이벤트 리스너 추가
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // 현재 선택된 팀 정보
  const currentTeam = teams.find(team => team.team_id === selectedTeam);

  // 팀 멤버 정렬 - CREATOR 먼저, 그 다음 ADMIN, 마지막으로 일반 사용자
  const sortedMembers = useMemo(() => {
    if (!members || members.length === 0) return [];
    
    return [...members].sort((a, b) => {
      // CREATOR가 우선
      if (a.google_id === currentTeam?.google_id && b.google_id !== currentTeam?.google_id) {
        return -1;
      }
      if (a.google_id !== currentTeam?.google_id && b.google_id === currentTeam?.google_id) {
        return 1;
      }
      
      // 그 다음 ADMIN 우선
      if (a.role === 'admin' && b.role !== 'admin') {
        return -1;
      }
      if (a.role !== 'admin' && b.role === 'admin') {
        return 1;
      }
      
      // 마지막으로 이름 알파벳 순
      return a.name.localeCompare(b.name);
    });
  }, [members, currentTeam]);

  return (
    <div className={styles.teamManagementContainer}>
      {/* 알림 메시지 */}
      {error && <div className={styles.errorMessage}>{error}</div>}
      {success && <div className={styles.successMessage}>{success}</div>}
      
      {/* 팀 선택 및 생성 영역 */}
      <div className={styles.teamSection}>
        <div className={styles.teamHeader}>
          <div className={styles.teamTitle}>팀</div>
          <button 
            className={styles.addTeamButton}
            onClick={showCreateTeamModal} // 팀 생성 모달 함수 변경
          >
            +
          </button>
        </div>
        
        <div className={styles.teamList}>
          {teams.map(team => (
            <div 
              key={team.team_id}
              className={`${styles.teamItem} ${selectedTeam === team.team_id ? styles.selectedTeam : ''}`}
              onClick={() => handleTeamSelect(team.team_id)}
            >
              <div className={styles.teamAvatar}>
                {team.abbreviation}
              </div>
              <div className={styles.teamName}>{team.team_name}</div>
            </div>
          ))}
        </div>
      </div>
      
      {/* 선택된 팀 세부 정보 */}
      {currentTeam && (
        <div className={styles.teamDetailContainer}>
          <div className={styles.teamDetailHeader}>
            <div className={styles.teamHeaderLeft}>
              <h2 className={styles.teamDetailTitle}>{currentTeam.team_name}</h2>
              <p className={styles.teamDetailDescription}>{currentTeam.description}</p>
            </div>

            {/* 팀 관리 버튼 영역 추가 */}
            <div className={styles.teamManageButtons}>
              {isCurrentUserAdmin() ? (
                <button 
                  className={styles.deleteTeamButton}
                  onClick={() => setDeleteTeamModalVisible(true)}
                >
                  팀 삭제
                </button>
              ) : (
                <button 
                  className={styles.leaveTeamButton}
                  onClick={() => setLeaveTeamModalVisible(true)}
                >
                  팀 탈퇴
                </button>
              )}
            </div>
          </div>
          
          {/* 팀 회원 섹션 */}
          <div className={styles.membersSection}>
            {/* 팀 회원 섹션 헤더 */}
            <div className={styles.membersSectionHeader}>
              <h3>팀 회원</h3>
              {isCurrentUserAdmin() && (
                <button 
                  className={styles.inviteButton}
                  onClick={() => setIsModalVisible(true)}
                >
                  멤버 초대
                </button>
              )}
            </div>
            
            <ul className={styles.membersList}>
              {sortedMembers.length === 0 ? (
                <li className={styles.emptyMessage}>팀원이 없습니다</li>
              ) : (
                sortedMembers.map(member => (
                  <li key={member.google_id} className={styles.memberItem}>
                    <div className={styles.memberInfo}>
                      <div className={styles.memberAvatar}>
                        {member.profileImageUrl ? (
                          <img src={member.profileImageUrl} alt={member.name} />
                        ) : (
                          member.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className={styles.memberName}>
                          {member.name}
                          {/* {member.google_id === currentTeam.google_id && (
                            <span className={styles.creatorBadge}>Creator</span>
                          )} */}
                          {member.google_id === userInfo?.google_id && (
                            <span className={styles.currentUserBadge}>Me</span>
                          )}
                        </div>
                        <div className={styles.memberEmail}>{member.email}</div>
                      </div>
                    </div>
                    
                    <div className={styles.memberControls}>
                      {isCurrentUserAdmin() ? (
                        <>
                          {member.google_id === currentTeam.google_id ? (
                            // Creator인 경우 - 변경 불가 표시만 보여줌
                            <div className={styles.roleControl}>
                              <span className={`${styles.roleTag} ${styles.creatorRoleTag}`}>
                                CREATOR
                              </span>
                            </div>
                          ) : (
                            // 일반 멤버인 경우 - 역할 변경 체크박스 표시
                            <div className={styles.roleControl}>
                              <span className={`${styles.roleTag} ${member.role === 'admin' ? styles.adminTag : ''}`}>
                                ADMIN
                              </span>
                              <label className={styles.switchContainer}>
                                <input 
                                  type="checkbox" 
                                  checked={member.role === 'admin'}
                                  onChange={(e) => {
                                    if (!isCurrentUserAdmin()) {
                                      showError('관리자만 역할을 변경할 수 있습니다.');
                                      return;
                                    }
                                    handleRoleChange(member.google_id, e.target.checked);
                                  }}
                                  disabled={member.google_id === userInfo?.google_id || !isCurrentUserAdmin()}
                                />
                                <span className={styles.slider}></span>
                              </label>
                            </div>
                          )}
                        </>
                      ) : (
                        <span className={`${styles.roleTag} ${
                          member.google_id === currentTeam.google_id ? 
                          styles.creatorRoleTag : 
                          (member.role === 'admin' ? styles.adminTag : styles.userTag)
                        }`}>
                          {member.google_id === currentTeam.google_id ? 'CREATOR' : 
                           (member.role === 'admin' ? 'ADMIN' : 'USER')}
                        </span>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
          
          {/* 팀 노드 섹션 - 노드 삭제 버튼 추가 */}
          <div className={styles.nodeSection}>
            <div className={styles.nodeSectionHeader}>
              <h3>팀 노드</h3>
              {isCurrentUserAdmin() && (
                <button 
                  className={styles.addNodeButton}
                  onClick={showAddNodeModal}
                >
                  노드 추가
                </button>
              )}
            </div>
            
            {teamNodes.length > 0 ? (
              <ul className={styles.nodesList}>
                {teamNodes.map(node => (
                  <li key={node.node_id} className={styles.nodeItem}>
                    <div className={styles.nodeInfo}>
                      <div className={styles.nodeName}>{node.node_name}</div>
                      {/* <span className={`${styles.nodeStatus} ${node.status === 'active' ? styles.activeNode : styles.inactiveNode}`}>
                        {node.status === 'active' ? '활성' : '비활성'}
                      </span> */}
                    </div>
                    <div className={styles.nodeActions}>
                      {/* <Link to={`/nodes/${node.node_id}`} className={styles.viewNodeButton}>
                        관리
                      </Link> */}
                      {isCurrentUserAdmin() && (
                        <button 
                          className={styles.viewNodeButton} 
                          onClick={() => showRemoveNodeModal(node)}
                        >
                          제거
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.nodePlaceholder}>
                <div className={styles.emptyNode}>
                  <div className={styles.nodeIcon}>🖥️</div>
                  <p>등록된 노드가 없습니다.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 멤버 초대 모달 (기존 방식) */}
      {isModalVisible && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} ref={modalRef}>
            <div className={styles.modalHeader}>
              <h3>팀원 초대</h3>
              <button className={styles.closeButton} onClick={() => setIsModalVisible(false)}>
                ✕
              </button>
            </div>
            
            <div className={styles.modalBody}>
              <form onSubmit={handleInviteUser}>
                <p>초대할 사용자의 이메일을 입력하세요:</p>
                <AutoComplete
                  value={inviteEmail}
                  options={emailOptions}
                  onSearch={handleEmailSearch}
                  onChange={(value) => setInviteEmail(value)}
                  placeholder="example@gmail.com"
                  className={styles.textInput}
                  style={{ width: '100%' }}
                  notFoundContent={searchingEmail ? "검색 중..." : "일치하는 이메일이 없습니다"}
                  onClick={(e) => e.stopPropagation()} // 이벤트 전파 중지
                  getPopupContainer={(trigger) => trigger.parentNode} // 드롭다운이 모달 내에 렌더링되도록 함
                />
                <div className={styles.modalFooter}>
                  <button 
                    type="button" 
                    className={styles.cancelButton} 
                    onClick={() => setIsModalVisible(false)}
                  >
                    취소
                  </button>
                  <button 
                    type="submit" 
                    className={styles.submitButton}
                  >
                    초대
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      {/* 팀 생성 모달 */}
      <div className={styles.modalOverlay} style={{ display: createTeamModalVisible ? 'flex' : 'none' }}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <h3>새 팀 만들기</h3>
            <button className={styles.closeButton} onClick={() => setCreateTeamModalVisible(false)}>
              ✕
            </button>
          </div>
          
          <div className={styles.modalBody}>
            <form>
              <div className={styles.formGroup}>
                <label>팀 이름</label>
                <Input
                  className={styles.textInput}
                  placeholder="팀 이름 입력"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  maxLength={30}
                />
              </div>

              <div className={styles.formGroup}>
                <label>관리할 노드 선택</label>
                <Select
                  style={{ width: '100%' }}
                  placeholder="관리할 노드 선택"
                  value={selectedNodeForNewTeam}
                  onChange={setSelectedNodeForNewTeam}
                  optionLabelProp="label"
                >
                  {nodes.map(node => (
                    <Select.Option key={node.node_id} value={node.node_id} label={node.node_name}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ marginRight: '8px' }}>
                          {/* {node.status === '1' ? '🟢' : '🔴'} */}
                        </span>
                        {node.node_name}
                      </div>
                    </Select.Option>
                  ))}
                </Select>
              </div>
              
              <div className={styles.modalFooter}>
                <button 
                  type="button" 
                  className={styles.cancelButton} 
                  onClick={() => setCreateTeamModalVisible(false)}
                >
                  취소
                </button>
                <button 
                  type="button" 
                  className={styles.submitButton}
                  onClick={handleCreateTeam}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '처리 중...' : '생성'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      
      {/* 노드 추가 모달 */}
      <div className={styles.modalOverlay} style={{ display: addNodeModalVisible ? 'flex' : 'none' }}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <h3>팀에 노드 추가</h3>
            <button className={styles.closeButton} onClick={() => setAddNodeModalVisible(false)}>
              ✕
            </button>
          </div>
          
          <div className={styles.modalBody}>
            <form>
              <div className={styles.formGroup}>
                <label>추가할 노드 선택</label>
                {getAvailableNodes().length > 0 ? (
                  <Select
                    style={{ width: '100%' }}
                    placeholder="추가할 노드 선택"
                    value={selectedNodeForTeam}
                    onChange={setSelectedNodeForTeam}
                    optionLabelProp="label"
                  >
                    {getAvailableNodes().map(node => (
                      <Select.Option key={node.node_id} value={node.node_id} label={node.node_name}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>{node.node_name}</span>
                          <span style={{ marginLeft: '8px', color: node.status === '1' ? '#52c41a' : '#f5222d' }}>
                            {/* {node.status === '1' ? '🟢 활성' : '🔴 비활성'} */}
                          </span>
                        </div>
                      </Select.Option>
                    ))}
                  </Select>
                ) : (
                  <div style={{ 
                    padding: '12px', 
                    background: '#333', 
                    borderRadius: '4px',
                    color: '#999'
                  }}>
                    추가 가능한 노드가 없습니다. 모든 노드가 이미 팀에 등록되었습니다.
                  </div>
                )}
              </div>
              
              {/* 설명 추가 */}
              <p style={{ fontSize: '13px', color: '#999', marginTop: '12px' }}>
                선택한 노드를 현재 팀에 연결하면 팀 멤버들이 노드를 모니터링할 수 있습니다.
              </p>
              
              <div className={styles.modalFooter}>
                <button 
                  type="button" 
                  className={styles.cancelButton} 
                  onClick={() => setAddNodeModalVisible(false)}
                >
                  취소
                </button>
                <button 
                  type="button" 
                  className={styles.submitButton}
                  onClick={handleAddNodeToTeam}
                  disabled={!selectedNodeForTeam || addingNode}
                >
                  {addingNode ? '처리 중...' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      
      {/* 팀 삭제 확인 모달 */}
      <div className={styles.modalOverlay} style={{ display: deleteTeamModalVisible ? 'flex' : 'none' }}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <h3>팀 삭제</h3>
            <button className={styles.closeButton} onClick={() => setDeleteTeamModalVisible(false)}>
              ✕
            </button>
          </div>
          
          <div className={styles.modalBody}>
            <p>정말로 '{currentTeam?.team_name}' 팀을 삭제하시겠습니까?</p>
            <p style={{ color: '#ff4d4f' }}>이 작업은 되돌릴 수 없으며, 팀 데이터가 모두 삭제됩니다.</p>
            
            <div className={styles.modalFooter}>
              <button 
                type="button" 
                className={styles.cancelButton} 
                onClick={() => setDeleteTeamModalVisible(false)}
              >
                취소
              </button>
              <button 
                type="button" 
                className={`${styles.submitButton} ${styles.dangerButton}`}
                onClick={handleDeleteTeam}
                disabled={processingAction}
              >
                {processingAction ? '처리 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 노드 제거 확인 모달 */}
      <div className={styles.modalOverlay} style={{ display: removeNodeModalVisible ? 'flex' : 'none' }}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <h3>노드 연결 해제</h3>
            <button className={styles.closeButton} onClick={() => {
              setRemoveNodeModalVisible(false);
              setNodeToRemove(null);
            }}>
              ✕
            </button>
          </div>
          
          <div className={styles.modalBody}>
            <p>'{nodeToRemove?.node_name}' 노드를 팀에서 제거하시겠습니까?</p>
            <p>노드는 삭제되지 않으며, 팀과의 연결만 해제됩니다.</p>
            
            <div className={styles.modalFooter}>
              <button 
                type="button" 
                className={styles.cancelButton} 
                onClick={() => {
                  setRemoveNodeModalVisible(false);
                  setNodeToRemove(null);
                }}
              >
                취소
              </button>
              <button 
                type="button" 
                className={styles.submitButton}
                onClick={handleRemoveNode}
                disabled={processingAction}
              >
                {processingAction ? '처리 중...' : '제거'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 팀 탈퇴 확인 모달 */}
      <div className={styles.modalOverlay} style={{ display: leaveTeamModalVisible ? 'flex' : 'none' }}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <h3>팀 탈퇴</h3>
            <button className={styles.closeButton} onClick={() => setLeaveTeamModalVisible(false)}>
              ✕
            </button>
          </div>
          
          <div className={styles.modalBody}>
            <p>정말로 '{currentTeam?.team_name}' 팀에서 탈퇴하시겠습니까?</p>
            <p>팀 관리자가 다시 초대하기 전까지 팀에 접근할 수 없게 됩니다.</p>
            
            <div className={styles.modalFooter}>
              <button 
                type="button" 
                className={styles.cancelButton} 
                onClick={() => setLeaveTeamModalVisible(false)}
              >
                취소
              </button>
              <button 
                type="button" 
                className={styles.submitButton}
                onClick={handleLeaveTeam}
                disabled={processingAction}
              >
                {processingAction ? '처리 중...' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* 로딩 표시기 */}
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner}></div>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;