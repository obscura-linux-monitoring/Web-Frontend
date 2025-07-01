import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useNodeContext } from '../../context/NodeContext';
import styles from '../../scss/node/Docker.module.scss';
import '../../scss/node/node_mobile/Docker.module.mobile.scss';
import api from '../../api';
import { useSshContext } from '../../context/SshContext';
import { getToken } from '../../utils/Auth';

// Docker 컨테이너 데이터 타입 정의
interface DockerContainer {
  id: string;
  name: string;
  image: string;
  active_state: string;
  block_read: number;
  block_write: number;
  cpu_usage: number;
  created: string;
  enabled: boolean;
  load_state: string;
  memory_limit: number;
  memory_percent: number;
  memory_usage: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  pids: number;
  restarts: number;
  status: string;
  sub_state: string;
  type: string;
  health_status: string;
}

// 정렬 필드와 방향 타입
type SortField = 'name' | 'status' | 'cpu_usage' | 'memory_percent' | 'created' | 'restarts';
type SortDirection = 'asc' | 'desc';

// 필터 상태 타입
interface FilterState {
  status: string;
  type: string;
  search: string;
}

const Docker = () => {
  const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();
  const { selectedNode, monitoringEnabled } = useNodeContext();
  const currentNodeId = paramNodeId || selectedNode?.node_id || '';

  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [expandedContainer, setExpandedContainer] = useState<string | null>(null);

  // 정렬 상태
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // 필터 상태
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    type: 'all',
    search: ''
  });

  // SSH Context 사용
  const {
    sshConnection,
    hasSshConnection,
    getSshConnection
  } = useSshContext();

  // 선택된 컨테이너
  const [selectedContainers, setSelectedContainers] = useState<string[]>([]);

  // 진행 중인 작업
  const [processing, setProcessing] = useState<{ id: string, action: string } | null>(null);

  // 복사 상태
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 컨테이너 데이터 가져오기
  useEffect(() => {
    if (!currentNodeId || !monitoringEnabled) {
      setLoading(false);
      return;
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/influx/containers/${currentNodeId}`);
        if (response.data && Array.isArray(response.data.containers)) {
          setContainers(response.data.containers);
          setError(null);
        } else {
          setError('Docker 컨테이너 데이터 형식이 잘못되었습니다.');
        }
      } catch (err) {
        console.error('Docker 컨테이너 조회 실패:', err);
        setError('Docker 컨테이너 데이터를 가져오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    // WebSocket 연결 설정
    let socket: WebSocket | null = null;

    const connectWebSocket = () => {
      try {
        socket = new WebSocket(`ws://1.209.148.143:8000/influx/ws/containers/${currentNodeId}`);

        socket.onopen = () => {
          console.log('Docker 모니터링 WebSocket 연결됨');
          setIsConnected(true);
          setError(null);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.containers && Array.isArray(data.containers)) {
              setContainers(data.containers);
              setLoading(false);
            }
          } catch (err) {
            console.error('WebSocket 메시지 파싱 실패:', err);
          }
        };

        socket.onerror = (err) => {
          console.error('WebSocket 에러:', err);
          setIsConnected(false);

          // 연결 실패시 REST API로 데이터 가져오기
          fetchInitialData();
        };

        socket.onclose = () => {
          console.log('Docker 모니터링 WebSocket 연결 종료됨');
          setIsConnected(false);
        };
      } catch (err) {
        console.error('WebSocket 연결 설정 실패:', err);
        // 연결 실패시 REST API로 데이터 가져오기
        fetchInitialData();
      }
    };

    // WebSocket 연결 시도
    connectWebSocket();

    // 초기 로드 (WebSocket이 실패할 경우 대비)
    fetchInitialData();

    // 컴포넌트 언마운트 시 정리
    return () => {
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;

        if (socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }
    };
  }, [currentNodeId, monitoringEnabled]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }

    api.get('/user/profile', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).then((res) => {
      // 기존 getSshConnection 호출을 context의 함수로 대체
      getSshConnection(res.data.user.sub, paramNodeId || '');
    }).catch((err) => {
      console.error('❌ 데이터 로딩 실패:', err);
    });

  }, [paramNodeId]);

  // 컨테이너 상세 정보 토글
  const toggleContainerDetails = (id: string) => {
    setExpandedContainer(expandedContainer === id ? null : id);
  };

  // 컨테이너 선택/해제
  const toggleContainerSelection = (id: string) => {
    setSelectedContainers(prev =>
      prev.includes(id)
        ? prev.filter(containerId => containerId !== id)
        : [...prev, id]
    );
  };

  // 정렬 처리
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  // 필터 변경 처리
  const handleFilterChange = (filterName: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  // 필터링된 컨테이너 목록
  const filteredContainers = containers.filter(container => {
    // 상태 필터
    if (filters.status !== 'all' && container.status.toLowerCase() !== filters.status) {
      return false;
    }

    // 타입 필터
    if (filters.type !== 'all' && container.type !== filters.type) {
      return false;
    }

    // 검색어 필터
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      return (
        container.name.toLowerCase().includes(searchTerm) ||
        container.image.toLowerCase().includes(searchTerm) ||
        container.id.toLowerCase().includes(searchTerm) ||
        container.status.toLowerCase().includes(searchTerm)
      );
    }

    return true;
  });

  // 정렬된 컨테이너 목록
  const sortedContainers = [...filteredContainers].sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'cpu_usage' || sortBy === 'memory_percent' || sortBy === 'restarts') {
      // 숫자 비교
      comparison = (a[sortBy] as number) - (b[sortBy] as number);
    } else if (sortBy === 'created') {
      // 날짜 비교
      const dateA = new Date(a.created);
      const dateB = new Date(b.created);
      comparison = dateA.getTime() - dateB.getTime();
    } else {
      // 문자열 비교
      const valueA = String(a[sortBy]).toLowerCase();
      const valueB = String(b[sortBy]).toLowerCase();
      comparison = valueA.localeCompare(valueB);
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // 컨테이너 시작 함수
  const startContainer = async (id: string) => {
    if (!currentNodeId || !monitoringEnabled) return;
    if (!hasSshConnection) {
      alert('SSH 연결이 없어 컨테이너를 시작할 수 없습니다. SSH 연결을 확인해주세요.');
      return;
    }

    // 컨테이너 이름 찾기
    const container = containers.find(c => c.id === id);
    if (!container) return;

    if (!window.confirm(`컨테이너 "${container.name}"을(를) 시작하시겠습니까?`)) {
      return;
    }

    setProcessing({ id, action: 'start' });

    try {
      const data = {
        id: id,
        google_id: sshConnection?.google_id || '',
        host: sshConnection?.host || '',
        key: sshConnection?.key || '',
        user: sshConnection?.user || '',
        password: sshConnection?.password || '',
        port: sshConnection?.port || '',
        node_id: currentNodeId || ''
      }
      const response = await api.post(`/ssh/start_docker_container`, data);
      console.log(response);
      if (response.data && response.data.success) {
        alert(`컨테이너 "${container.name}"이(가) 시작되었습니다.`);
      } else {
        throw new Error(response.data.error || `컨테이너 "${container.name}" 시작에 실패했습니다`);
      }
      // 상태 업데이트는 WebSocket을 통해 자동으로 이루어짐
    } catch (err) {
      console.error('컨테이너 시작 실패:', err);
      alert(`컨테이너 "${container.name}" 시작에 실패했습니다.`);
    } finally {
      setProcessing(null);
    }
  };

  // 컨테이너 중지 함수
  const stopContainer = async (id: string) => {
    if (!currentNodeId || !monitoringEnabled) return;
    if (!hasSshConnection) {
      alert('SSH 연결이 없어 컨테이너를 중지할 수 없습니다. SSH 연결을 확인해주세요.');
      return;
    }

    // 컨테이너 이름 찾기
    const container = containers.find(c => c.id === id);
    if (!container) return;

    if (!window.confirm(`컨테이너 "${container.name}"을(를) 중지하시겠습니까?`)) {
      return;
    }

    setProcessing({ id, action: 'stop' });

    try {
      const data = {
        id: id,
        google_id: sshConnection?.google_id || '',
        host: sshConnection?.host || '',
        key: sshConnection?.key || '',
        user: sshConnection?.user || '',
        password: sshConnection?.password || '',
        port: sshConnection?.port || '',
        node_id: currentNodeId || ''
      }
      const response = await api.post(`/ssh/stop_docker_container`, data);
      console.log(response);
      if (response.data && response.data.success) {
        alert(`컨테이너 "${container.name}"이(가) 중지되었습니다.`);
      } else {
        throw new Error(response.data.error || `컨테이너 "${container.name}" 중지에 실패했습니다`);
      }
      // 상태 업데이트는 WebSocket을 통해 자동으로 이루어짐
    } catch (err) {
      console.error('컨테이너 중지 실패:', err);
      alert(`컨테이너 "${container.name}" 중지에 실패했습니다.`);
    } finally {
      setProcessing(null);
    }
  };

  // 컨테이너 재시작 함수
  const restartContainer = async (id: string) => {
    if (!currentNodeId || !monitoringEnabled) return;
    if (!hasSshConnection) {
      alert('SSH 연결이 없어 컨테이너를 재시작할 수 없습니다. SSH 연결을 확인해주세요.');
      return;
    }

    // 컨테이너 이름 찾기
    const container = containers.find(c => c.id === id);
    if (!container) return;

    if (!window.confirm(`컨테이너 "${container.name}"을(를) 재시작하시겠습니까?`)) {
      return;
    }

    setProcessing({ id, action: 'restart' });

    try {
      const data = {
        id: id,
        google_id: sshConnection?.google_id || '',
        host: sshConnection?.host || '',
        key: sshConnection?.key || '',
        user: sshConnection?.user || '',
        password: sshConnection?.password || '',
        port: sshConnection?.port || '',
        node_id: currentNodeId || ''
      }
      const response = await api.post(`/ssh/restart_docker_container`, data);
      console.log(response);
      if (response.data && response.data.success) {
        alert(`컨테이너 "${container.name}"이(가) 재시작되었습니다.`);
      } else {
        throw new Error(response.data.error || `컨테이너 "${container.name}" 재시작에 실패했습니다`);
      }
      // 상태 업데이트는 WebSocket을 통해 자동으로 이루어짐
    } catch (err) {
      console.error('컨테이너 재시작 실패:', err);
      alert(`컨테이너 "${container.name}" 재시작에 실패했습니다.`);
    } finally {
      setProcessing(null);
    }
  };

  // 컨테이너 삭제 함수
  const deleteContainer = async (id: string) => {
    if (!currentNodeId || !monitoringEnabled) return;
    if (!hasSshConnection) {
      alert('SSH 연결이 없어 컨테이너를 삭제할 수 없습니다. SSH 연결을 확인해주세요.');
      return;
    }

    // 컨테이너 이름 찾기
    const container = containers.find(c => c.id === id);
    if (!container) return;

    if (!window.confirm(`컨테이너 "${container.name}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    setProcessing({ id, action: 'delete' });

    try {
      const data = {
        id: id,
        google_id: sshConnection?.google_id || '',
        host: sshConnection?.host || '',
        key: sshConnection?.key || '',
        user: sshConnection?.user || '',
        password: sshConnection?.password || '',
        port: sshConnection?.port || '',
        node_id: currentNodeId || ''
      }
      const response = await api.post(`/ssh/remove_docker_container`, data);
      console.log(response);
      if (response.data && response.data.success) {
        alert(`컨테이너 "${container.name}"이(가) 삭제되었습니다.`);
      } else {
        throw new Error(response.data.error || `컨테이너 "${container.name}" 삭제에 실패했습니다`);
      }
      // 상태 업데이트는 WebSocket을 통해 자동으로 이루어짐
    } catch (err) {
      console.error('컨테이너 삭제 실패:', err);
      alert(`컨테이너 "${container.name}" 삭제에 실패했습니다.`);
    } finally {
      setProcessing(null);
    }
  };

  // 단위 변환 함수
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';

    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // 날짜 포맷팅 함수
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // 상태에 따른 클래스 반환
  const getStatusClass = (status: string): string => {
    const lowerStatus = status.toLowerCase();

    if (lowerStatus.startsWith('up') || lowerStatus === 'active') {
      return styles.statusRunning;
    } else if (lowerStatus.includes('exited') || lowerStatus === 'inactive') {
      return styles.statusStopped;
    } else if (lowerStatus.includes('paused')) {
      return styles.statusPaused;
    } else if (lowerStatus.includes('created')) {
      return styles.statusCreated;
    } else if (lowerStatus.includes('restarting')) {
      return styles.statusRestarting;
    } else {
      return styles.statusUnknown;
    }
  };

  // 복사 함수
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedId(text);
        setTimeout(() => setCopiedId(null), 2000); // 2초 후 복사 상태 초기화
      })
      .catch(err => {
        console.error('클립보드 복사 실패:', err);
      });
  };

  return (
    <div className={styles.dockerContainer}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2>🐳 Docker 컨테이너 관리</h2>
          <div className={styles.connectionStatus}>
            {!monitoringEnabled ? (
              <span className={styles.disconnected}>● 모니터링 비활성화</span>
            ) : isConnected ? (
              <span className={styles.connected}>● 실시간 모니터링 활성화</span>
            ) : (
              <span className={styles.disconnected}>● 연결 끊김</span>
            )}
            {!hasSshConnection && (
              <span className={styles.disconnected} style={{ marginLeft: '10px' }}>● SSH 연결 없음</span>
            )}
          </div>
        </div>

        <div className={styles.filterControls}>
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder="컨테이너 검색..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              disabled={!monitoringEnabled}
              className={styles.searchInput}
            />
          </div>

          {/* <div className={styles.filterDropdowns}>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              disabled={!monitoringEnabled}
              className={styles.filterSelect}
            >
              <option value="all">모든 상태</option>
              <option value="running">실행 중</option>
              <option value="exited">종료됨</option>
              <option value="paused">일시 중지됨</option>
              <option value="created">생성됨</option>
            </select>

            <select
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              disabled={!monitoringEnabled}
              className={styles.filterSelect}
            >
              <option value="all">모든 유형</option>
              <option value="container">컨테이너</option>
              <option value="service">서비스</option>
            </select>
          </div> */}
        </div>

        {selectedContainers.length > 0 && monitoringEnabled && (
          <div className={styles.bulkActions}>
            <button
              className={`${styles.actionButton} ${styles.startButton}`}
              onClick={() => {
                // 선택된 모든 컨테이너 이름 가져오기
                const selectedNames = selectedContainers
                  .map(id => containers.find(c => c.id === id)?.name)
                  .filter(Boolean)
                  .join(", ");

                // 선택된 모든 컨테이너 시작
                if (window.confirm(`선택한 컨테이너(${selectedNames})를 시작하시겠습니까?`)) {
                  Promise.all(selectedContainers.map(id => api.post(`/docker/containers/${currentNodeId}/${id}/start`)))
                    .then(() => {
                      // 성공적으로 처리됨
                      setSelectedContainers([]);
                    })
                    .catch(err => {
                      console.error('일괄 시작 실패:', err);
                      alert('일부 컨테이너 시작에 실패했습니다.');
                    });
                }
              }}
            >
              선택한 컨테이너 시작 ({selectedContainers.length})
            </button>

            <button
              className={`${styles.actionButton} ${styles.stopButton}`}
              onClick={() => {
                // 선택된 모든 컨테이너 이름 가져오기
                const selectedNames = selectedContainers
                  .map(id => containers.find(c => c.id === id)?.name)
                  .filter(Boolean)
                  .join(", ");

                // 선택된 모든 컨테이너 중지
                if (window.confirm(`선택한 컨테이너(${selectedNames})를 중지하시겠습니까?`)) {
                  Promise.all(selectedContainers.map(id => api.post(`/docker/containers/${currentNodeId}/${id}/stop`)))
                    .then(() => {
                      // 성공적으로 처리됨
                      setSelectedContainers([]);
                    })
                    .catch(err => {
                      console.error('일괄 중지 실패:', err);
                      alert('일부 컨테이너 중지에 실패했습니다.');
                    });
                }
              }}
            >
              선택한 컨테이너 중지 ({selectedContainers.length})
            </button>

            <button
              className={`${styles.actionButton} ${styles.clearButton}`}
              onClick={() => setSelectedContainers([])}
            >
              선택 취소
            </button>
          </div>
        )}

        <div className={styles.stats}>
          <span>총 컨테이너: {containers.length}</span>
          <span>표시됨: {sortedContainers.length}</span>
          <span>실행 중: {containers.filter(c => c.status.toLowerCase().startsWith('up')).length}</span>
          <span>중지됨: {containers.filter(c => c.status.toLowerCase().includes('exited')).length}</span>
        </div>
      </div>

      {/* 로딩 상태 */}
      {loading && containers.length === 0 && (
        <div className={styles.loadingContainer}>
          <p>⏳ Docker 컨테이너 정보를 불러오는 중...</p>
        </div>
      )}

      {/* 에러 상태 */}
      {error && (
        <div className={styles.errorContainer}>
          <p>❌ {error}</p>
          <button
            onClick={() => window.location.reload()}
            className={styles.retryButton}
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 모니터링 비활성화 상태 */}
      {!monitoringEnabled && (
        <div className={styles.monitoringDisabled}>
          <p>모니터링이 비활성화되어 있습니다. Docker 컨테이너 정보를 볼 수 없습니다.</p>
        </div>
      )}

      {/* 테이블 컨테이너 */}
      <div className={styles.tableContainer}>
        {monitoringEnabled && !loading && !error && sortedContainers.length === 0 ? (
          <div className={styles.noData}>
            <p>표시할 Docker 컨테이너가 없습니다.</p>
          </div>
        ) : (
          <table className={styles.dockerTable}>
            <thead>
              <tr>
                <th className={styles.checkboxColumn}>
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedContainers(sortedContainers.map(c => c.id));
                      } else {
                        setSelectedContainers([]);
                      }
                    }}
                    checked={
                      sortedContainers.length > 0 &&
                      sortedContainers.every(c => selectedContainers.includes(c.id))
                    }
                    disabled={!monitoringEnabled || sortedContainers.length === 0}
                  />
                </th>
                <th
                  className={sortBy === 'name' ? styles.sorted : ''}
                  onClick={() => handleSort('name')}
                >
                  이름 {sortBy === 'name' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
                <th
                  className={sortBy === 'status' ? styles.sorted : ''}
                  onClick={() => handleSort('status')}
                >
                  상태 {sortBy === 'status' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
                <th
                  className={sortBy === 'cpu_usage' ? styles.sorted : ''}
                  onClick={() => handleSort('cpu_usage')}
                >
                  CPU {sortBy === 'cpu_usage' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
                <th
                  className={sortBy === 'memory_percent' ? styles.sorted : ''}
                  onClick={() => handleSort('memory_percent')}
                >
                  메모리 {sortBy === 'memory_percent' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
                <th
                  className={sortBy === 'created' ? styles.sorted : ''}
                  onClick={() => handleSort('created')}
                >
                  생성일 {sortBy === 'created' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
                <th
                  className={sortBy === 'restarts' ? styles.sorted : ''}
                  onClick={() => handleSort('restarts')}
                >
                  재시작 {sortBy === 'restarts' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
                <th className={styles.actionsColumn}>작업</th>
              </tr>
            </thead>
            <tbody>
              {sortedContainers.map((container) => (
                <React.Fragment key={container.id}>
                  <tr
                    className={`
                      ${selectedContainers.includes(container.id) ? styles.selected : ''}
                      ${expandedContainer === container.id ? styles.expanded : ''}
                    `}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedContainers.includes(container.id)}
                        onChange={() => toggleContainerSelection(container.id)}
                        disabled={!monitoringEnabled}
                      />
                    </td>
                    <td className={styles.nameColumn}>
                      <div className={styles.containerName} onClick={() => toggleContainerDetails(container.id)}>
                        <span className={styles.expandIcon}>
                          {expandedContainer === container.id ? '▼' : '▶'}
                        </span>
                        {container.name}
                      </div>
                      <div className={styles.imageInfo}>{container.image}</div>
                      <div className={styles.idInfo}>ID: {container.id.substring(0, 12)}</div>
                    </td>
                    <td>
                      <span className={getStatusClass(container.status)}>
                        {container.status}
                      </span>
                    </td>
                    <td>
                      <div className={styles.usageBar}>
                        <div
                          className={styles.cpuBar}
                          style={{
                            // 최소 너비 1%로 설정하여 매우 작은 값도 시각적으로 표시
                            width: `${Math.max(Math.min(container.cpu_usage, 100), container.cpu_usage > 0 ? 1 : 0)}%`
                          }}
                        ></div>
                        <span>
                          {container.cpu_usage.toFixed(1)} %
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.usageBar}>
                        <div
                          className={styles.memoryBar}
                          style={{ width: `${Math.min(container.memory_percent, 100)}%` }}
                        ></div>
                        <span>{container.memory_percent.toFixed(1)}%</span>
                      </div>
                      <div className={styles.memoryInfo}>
                        {formatBytes(container.memory_usage)} / {formatBytes(container.memory_limit)}
                      </div>
                    </td>
                    <td>{formatDate(container.created)}</td>
                    <td>{container.restarts}</td>
                    <td className={styles.actionsCell}>
                      <div className={styles.actionButtons}>
                        {container.status.toLowerCase().startsWith('up') ? (
                          <>
                            <button
                              className={`${styles.actionButton} ${styles.restartButton}`}
                              onClick={() => restartContainer(container.id)}
                              disabled={processing?.id === container.id || !monitoringEnabled}
                            >
                              {processing?.id === container.id && processing?.action === 'restart'
                                ? '처리중...'
                                : '재시작'}
                            </button>
                            <button
                              className={`${styles.actionButton} ${styles.stopButton}`}
                              onClick={() => stopContainer(container.id)}
                              disabled={processing?.id === container.id || !monitoringEnabled}
                            >
                              {processing?.id === container.id && processing?.action === 'stop'
                                ? '처리중...'
                                : '중지'}
                            </button>
                          </>
                        ) : (
                          <button
                            className={`${styles.actionButton} ${styles.startButton}`}
                            onClick={() => startContainer(container.id)}
                            disabled={processing?.id === container.id || !monitoringEnabled}
                          >
                            {processing?.id === container.id && processing?.action === 'start'
                              ? '처리중...'
                              : '시작'}
                          </button>
                        )}
                        <button
                          className={`${styles.actionButton} ${styles.deleteButton}`}
                          onClick={() => deleteContainer(container.id)}
                          disabled={processing?.id === container.id || !monitoringEnabled}
                        >
                          {processing?.id === container.id && processing?.action === 'delete'
                            ? '처리중...'
                            : '삭제'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* 상세 정보 패널 */}
                  {expandedContainer === container.id && (
                    <tr className={styles.detailsRow}>
                      <td colSpan={8}>
                        <div className={styles.detailsPanel}>
                          <div className={styles.detailsGrid}>
                            <div className={styles.detailsSection}>
                              <h3>기본 정보</h3>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>ID:</span>
                                <div className={styles.idContainer}>
                                  <span className={styles.detailsValue}>{container.id}</span>
                                </div>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>이름:</span>
                                <span className={styles.detailsValue}>{container.name}</span>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>이미지:</span>
                                <span className={styles.detailsValue}>{container.image}</span>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>생성일:</span>
                                <span className={styles.detailsValue}>{formatDate(container.created)}</span>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>유형:</span>
                                <span className={styles.detailsValue}>{container.type}</span>
                              </div>
                            </div>

                            <div className={styles.detailsSection}>
                              <h3>상태 정보</h3>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>상태:</span>
                                <span className={`${styles.detailsValue} ${getStatusClass(container.status)}`}>
                                  {container.status}
                                </span>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>활성화 여부:</span>
                                <span className={styles.detailsValue}>{container.status.toLowerCase().startsWith('up') ? '활성화됨' : '비활성화됨'}</span>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>재시작 횟수:</span>
                                <span className={styles.detailsValue}>{container.restarts}</span>
                              </div>
                            </div>

                            <div className={styles.detailsSection}>
                              <h3>리소스 사용량</h3>
                              <div className={styles.detailsItem}>
                                <span
                                  className={`${styles.detailsLabel} ${container.cpu_usage > 80 ? styles.highUsage :
                                    container.cpu_usage > 50 ? styles.mediumUsage :
                                      styles.lowUsage
                                    }`}
                                >
                                  CPU 사용률:
                                </span>
                                <span className={styles.detailsValue}>
                                  {(container.cpu_usage).toFixed(2)}%
                                </span>
                                <div className={styles.resourceBar}>
                                  <div
                                    className={styles.resourceBarFill}
                                    style={{
                                      width: `${Math.min(container.cpu_usage, 100)}%`,
                                      backgroundColor: '#3498db'
                                    }}
                                  ></div>
                                </div>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>메모리 사용률:</span>
                                <span className={styles.detailsValue}>{container.memory_percent.toFixed(2)}%</span>
                                <div className={styles.resourceBar}>
                                  <div
                                    className={styles.resourceBarFill}
                                    style={{
                                      width: `${Math.min(container.memory_percent, 100)}%`,
                                      backgroundColor: '#2ecc71'
                                    }}
                                  ></div>
                                </div>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>메모리 사용량:</span>
                                <span className={styles.detailsValue}>
                                  {formatBytes(container.memory_usage)} / {formatBytes(container.memory_limit)}
                                </span>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>프로세스 수:</span>
                                <span className={styles.detailsValue}>{container.pids}</span>
                              </div>
                            </div>

                            <div className={styles.detailsSection}>
                              <h3>I/O 정보</h3>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>블록 읽기:</span>
                                <span className={styles.detailsValue}>{formatBytes(container.block_read)}</span>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>블록 쓰기:</span>
                                <span className={styles.detailsValue}>{formatBytes(container.block_write)}</span>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>네트워크 수신:</span>
                                <span className={styles.detailsValue}>{formatBytes(container.network_rx_bytes)}</span>
                              </div>
                              <div className={styles.detailsItem}>
                                <span className={styles.detailsLabel}>네트워크 전송:</span>
                                <span className={styles.detailsValue}>{formatBytes(container.network_tx_bytes)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Docker;