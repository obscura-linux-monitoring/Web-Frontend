import styles from '../scss/Header.module.scss';
import { getUserInfo, getUserProfileImage, getToken } from '../utils/Auth';
import { useState, useRef, useEffect } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useNodeContext } from '../context/NodeContext';
import MiniMetricsGraph from './node/MiniMetricsGraph';
import api from '../api';
import { message } from 'antd'; // Ant Design 컴포넌트 추가

// 새로운 인터페이스 추가
interface Invitation {
  invitation_id: string;
  team_id: string;
  team_name: string;
  invited_by: string;
  inviter_name: string;
  role: string;
  created_at: string;
}

interface HeaderProps {
  onLogout: () => void | Promise<void>;
  isAdmin?: boolean;
}

const Header = ({ onLogout, isAdmin = false }: HeaderProps) => {
  const profileImageUrl = getUserProfileImage();
  const userInfo = getUserInfo();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { selectedNode, monitoringEnabled, toggleMonitoring } = useNodeContext();
  const { nodeId } = useParams<{ nodeId: string }>();
  const location = useLocation(); // 현재 경로 가져오기
  // 초대 알림 관련 상태 추가
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showInvitations, setShowInvitations] = useState(false);
  const invitationsRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  // 초대 목록 가져오기
  const fetchInvitations = async () => {
    try {
      const token = getToken();
      if (!token) return;

      setLoading(true);
      const response = await api.get('/team/invitations', {
        headers: { Authorization: `Bearer ${token}` }
      });

      setInvitations(response.data.invitations || []);
    } catch (err) {
      console.error('초대 목록을 가져오는 중 오류 발생:', err);
    } finally {
      setLoading(false);
    }
  };

  // 컴포넌트 마운트 시 초대 목록 가져오기
  useEffect(() => {
    fetchInvitations();

    // 옵션: 60초마다 초대 목록 새로고침
    const intervalId = setInterval(fetchInvitations, 60000);

    return () => clearInterval(intervalId);
  }, []);

  // 외부 클릭 감지로 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }

      if (invitationsRef.current && !invitationsRef.current.contains(event.target as Node)) {
        setShowInvitations(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 초대 수락 처리
  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      const token = getToken();
      await api.post(`/team/invitations/accept/${invitationId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // 초대 목록 갱신
      setInvitations(invitations.filter(inv => inv.invitation_id !== invitationId));
      message.success('팀 초대를 수락했습니다.');
    } catch (err) {
      console.error('초대 수락 중 오류 발생:', err);
      message.error('초대 수락에 실패했습니다.');
    }
  };

  // 초대 거절 처리
  const handleRejectInvitation = async (invitationId: string) => {
    try {
      const token = getToken();
      await api.delete(`/team/invitations/${invitationId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // 초대 목록 갱신
      setInvitations(invitations.filter(inv => inv.invitation_id !== invitationId));
      message.success('팀 초대를 거절했습니다.');
    } catch (err) {
      console.error('초대 거절 중 오류 발생:', err);
      message.error('초대 거절에 실패했습니다.');
    }
  };

  // 현재 URL의 nodeId 또는 context의 selectedNode 사용
  const currentNodeId = nodeId || selectedNode?.node_id;

  // 현재 활성화된 메뉴 경로 확인
  const isMonitoringActive = location.pathname.includes('/nodes/monitoring/');
  const isProcessActive = location.pathname.includes('/nodes/process/');
  const isDockerActive = location.pathname.includes('/nodes/docker/');
  const isTerminalActive = location.pathname.includes('/nodes/terminal/');
  const isPerformanceActivate = location.pathname.includes('/nodes/performance/');
  const isServicectivate = location.pathname.includes('/nodes/service/');

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <div className={styles.headerLeft}>
          {currentNodeId ? (
            <div className={styles.nodeLinks}>
              {/* 모니터링 토글 버튼 */}
              <button
                className={`${styles.monitoringToggle} ${monitoringEnabled ? styles.enabled : styles.disabled}`}
                onClick={toggleMonitoring}
                title={monitoringEnabled ? '모니터링 중지' : '모니터링 시작'}
              >
                <span className={styles.toggleIcon}></span>
                <span className={styles.toggleText}>
                  {monitoringEnabled ? 'ON' : 'OFF'}
                </span>
              </button>

              {monitoringEnabled && <MiniMetricsGraph />}

              <Link
                to={`/nodes/monitoring/${currentNodeId}`}
                className={`${styles.nodeLink} ${isMonitoringActive ? styles.activeLink : ''}`}
              >
                모니터링
                {isMonitoringActive && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link
                to={`/nodes/process/${currentNodeId}`}
                className={`${styles.nodeLink} ${isProcessActive ? styles.activeLink : ''}`}
              >
                프로세스
                {isProcessActive && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link
                to={`/nodes/performance/${currentNodeId}`}
                className={`${styles.nodeLink} ${isPerformanceActivate ? styles.activeLink : ''}`}
              >
                작업관리자
                {isPerformanceActivate && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link
                to={`/nodes/docker/${currentNodeId}`}
                className={`${styles.nodeLink} ${isDockerActive ? styles.activeLink : ''}`}
              >
                Docker
                {isDockerActive && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link
                to={`/nodes/service/${currentNodeId}`}
                className={`${styles.nodeLink} ${isServicectivate ? styles.activeLink : ''}`}
              >
                서비스
                {isServicectivate && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link
                to={`/nodes/terminal/${currentNodeId}`}
                className={`${styles.nodeLink} ${isTerminalActive ? styles.activeLink : ''}`}
              >
                터미널
                {isTerminalActive && <span className={styles.activeIndicator}></span>}
              </Link>
            </div>
          ) : (
            <span className={styles.noNodeSelected}>노드를 선택해주세요</span>
          )}
        </div>
        <div className={styles.headerRight}>
          {/* 초대 알림 버튼 추가 - 종 아이콘으로 변경 */}
          <div className={styles.invitationsContainer} ref={invitationsRef}>
            <button
              className={styles.invitationsButton}
              onClick={() => setShowInvitations(!showInvitations)}
              title="팀 초대 알림"
            >
              <svg
                className={styles.bellIcon}
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              {invitations.length > 0 && (
                <span className={styles.badgeCount}>{invitations.length}</span>
              )}
            </button>

            {showInvitations && (
              <div className={styles.invitationsDropdown}>
                <h3 className={styles.invitationsTitle}>팀 초대 알림</h3>

                {loading ? (
                  <p className={styles.loadingText}>로딩 중...</p>
                ) : invitations.length === 0 ? (
                  <p className={styles.emptyInvitations}>새로운 초대가 없습니다</p>
                ) : (
                  <ul className={styles.invitationsList}>
                    {invitations.map(invitation => (
                      <li key={invitation.invitation_id} className={styles.invitationItem}>
                        <div className={styles.invitationContent}>
                          <p className={styles.invitationText}>
                            <strong>{invitation.inviter_name}</strong>님이
                            <strong> {invitation.team_name}</strong> 팀에 초대했습니다.
                          </p>
                          <p className={styles.invitationDate}>
                            {new Date(invitation.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className={styles.invitationActions}>
                          <button
                            className={`${styles.invitationButton} ${styles.acceptButton}`}
                            onClick={() => handleAcceptInvitation(invitation.invitation_id)}
                          >
                            수락
                          </button>
                          <button
                            className={`${styles.invitationButton} ${styles.rejectButton}`}
                            onClick={() => handleRejectInvitation(invitation.invitation_id)}
                          >
                            거절
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* 기존 프로필 드롭다운 */}
          <div className={styles.profileContainer} ref={dropdownRef}>
            <div
              className={styles.profileImage}
              title={`${userInfo?.name || userInfo?.email || '사용자'} 프로필`}
              onClick={() => setShowDropdown(!showDropdown)}
            >
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="Profile" />
              ) : (
                <div className={styles.placeholderImage}>
                  {userInfo?.email?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>

            {showDropdown && (
              <div className={styles.dropdown}>
                <div className={styles.userInfo}>
                  <p className={styles.userName}>{userInfo?.name || '사용자'}</p>
                  <p className={styles.userEmail}>{userInfo?.email}</p>
                </div>
                <div className={styles.dropdownButtons}>
                  <Link to="/profile" className={styles.dropdownButton}>
                    👤 프로필 보기
                  </Link>

                  {isAdmin && (
                    <Link to="/admin" className={styles.dropdownButton}>
                      🔒 관리자 페이지
                    </Link>
                  )}

                  <button
                    className={`${styles.dropdownButton} ${styles.logoutButton}`}
                    onClick={onLogout}
                  >
                    🚪 로그아웃
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;