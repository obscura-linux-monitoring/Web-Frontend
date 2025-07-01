import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import styles from '../../scss/node/ProcessView.module.scss';
import '../../scss/node/node_mobile/ProcessView.module.mobile.scss';
import { useNodeContext } from '../../context/NodeContext';
import api from '../../api';
import { useSshContext } from '../../context/SshContext';
import { getToken } from '../../utils/Auth';

// 서버로부터 받는 프로세스 데이터 타입 정의
type Process = {
  pid: number;
  ppid: number;
  name: string;
  user: string;
  cpu_usage: number;
  cpu_time: number;
  memory_rss: number;
  memory_vsz: number;
  io_read_bytes: number;
  io_write_bytes: number;
  status: string;
  threads: number;
  nice: number;
  open_files: number;
  command: string;
  start_time: number; // Unix 타임스탬프
};

// props 인터페이스를 선택적으로 변경
interface ProcessViewProps {
  nodeId?: string; // nodeId를 선택적으로 변경
}

// 툴팁 상태 인터페이스 추가
interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: string | null;
  loading: boolean;
  pid: number;
}

// 컨텍스트 메뉴 상태 인터페이스 추가
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  process: Process | null;
}

type SortField = 'pid' | 'name' | 'user' | 'cpu_usage' | 'memory_rss' | 'cpu_time' | 'threads' | 'start_time';
type SortDirection = 'asc' | 'desc';

const ProcessView = ({ nodeId: propsNodeId }: ProcessViewProps = {}) => {
  // URL 파라미터에서 nodeId 가져오기
  const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();
  // NodeContext에서 선택된 노드 정보와 모니터링 상태 가져오기
  const { selectedNode, monitoringEnabled } = useNodeContext();

  // props > URL 파라미터 > 컨텍스트 순으로 nodeId 결정
  const nodeId = propsNodeId || paramNodeId || selectedNode?.node_id || '';

  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('cpu_usage');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedProcesses, setSelectedProcesses] = useState<number[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [processingAction, setProcessingAction] = useState<{ pid: number; action: string } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'pid', 'name', 'user', 'cpu_usage', 'memory_rss', 'status', 'start_time', 'command'
  ]);

  // 툴팁 관련 상태 추가
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipCacheRef = useRef<Record<number, string>>({});
  const tooltipTimerRef = useRef<number | null>(null);

  // SSH Context 사용
  const {
    sshConnection,
    hasSshConnection,
    getSshConnection
  } = useSshContext();

  // 컨텍스트 메뉴 상태 추가
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    process: null
  });

  // Toggle column visibility (actions 관련 코드 제거)
  const toggleColumnVisibility = (column: string) => {
    setVisibleColumns(prev =>
      prev.includes(column)
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  // 툴팁 요청 및 표시 함수
  const fetchProcessTooltip = useCallback(async (process: Process, x: number, y: number) => {
    // 이미 캐시에 있으면 바로 표시
    if (tooltipCacheRef.current[process.pid]) {
      setTooltip({
        visible: true,
        x,
        y,
        content: tooltipCacheRef.current[process.pid],
        loading: false,
        pid: process.pid
      });
      return;
    }

    // 로딩 상태로 툴팁 표시
    setTooltip({
      visible: true,
      x,
      y,
      content: null,
      loading: true,
      pid: process.pid
    });

    try {
      // 서버로 보낼 데이터 준비
      const requestData = {
        pid: process.pid,
        name: process.name,
        user: process.user,
        cpu: process.cpu_usage,
        memory: process.memory_rss,
        command: process.command
      };

      // API 요청 보내기
      const response = await api.post('/api/tooltips', requestData);
      const tooltipContent = response.data;

      // 캐시에 저장
      tooltipCacheRef.current[process.pid] = tooltipContent;

      // 툴팁 업데이트 (아직 같은 프로세스에 호버 중일 때만)
      setTooltip(prev => {
        if (prev && prev.pid === process.pid) {
          return {
            ...prev,
            content: tooltipContent,
            loading: false
          };
        }
        return prev;
      });
    } catch (error) {
      console.error('툴팁 정보 가져오기 실패:', error);

      // 기본 정보로 툴팁 표시
      const defaultContent = `
        <div>
          <strong>${process.name}</strong> (PID: ${process.pid})<br/>
          사용자: ${process.user}<br/>
          CPU: ${process.cpu_usage.toFixed(1)}%<br/>
          메모리: ${formatBytes(process.memory_rss)}<br/>
          상태: ${process.status}
        </div>
      `;

      // 캐시에 저장
      tooltipCacheRef.current[process.pid] = defaultContent;

      // 툴팁 업데이트
      setTooltip(prev => {
        if (prev && prev.pid === process.pid) {
          return {
            ...prev,
            content: defaultContent,
            loading: false
          };
        }
        return prev;
      });
    }
  }, []);

  // 마우스 호버 이벤트 핸들러
  const handleProcessNameHover = useCallback((e: React.MouseEvent, process: Process) => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    fetchProcessTooltip(process, rect.right, rect.top);
  }, [fetchProcessTooltip]);

  // 마우스 떠남 이벤트 핸들러
  const handleProcessNameLeave = useCallback(() => {
    // 약간의 지연을 두어 툴팁이 깜빡이는 것을 방지
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
    }

    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltip(null);
      tooltipTimerRef.current = null;
    }, 150);
  }, []);

  // 컴포넌트 언마운트 시 타이머 정리
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

    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  // WebSocket으로 프로세스 데이터 가져오기
  useEffect(() => {
    // nodeId가 없으면 로딩 상태 유지, 오류 메시지 표시
    if (!nodeId) {
      setError("유효한 노드 ID가 필요합니다. URL을 확인해주세요.");
      setLoading(false);
      return;
    }

    // 모니터링이 비활성화되어 있으면 연결하지 않음
    if (!monitoringEnabled) {
      setConnected(false);
      return;
    }

    // WebSocket 연결
    const socket = new WebSocket(`ws://1.209.148.143:8000/influx/ws/processes/${nodeId}`);

    socket.onopen = () => {
      console.log('📡 WebSocket 연결됨 - 프로세스 모니터링');
      setConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProcesses(data.processes || []);
        setError(null);
        setLoading(false);
      } catch (err) {
        console.error('❌ WebSocket 메시지 파싱 실패:', err);
        setError('데이터 수신 오류');
      }
    };

    socket.onerror = (err) => {
      console.error('❌ WebSocket 에러:', err);
      setError('WebSocket 연결 실패');
      setConnected(false);
    };

    socket.onclose = () => {
      console.log('🔌 WebSocket 연결 종료 - 프로세스 모니터링');
      setConnected(false);
    };

    return () => {
      socket.close(); // cleanup
    };
  }, [nodeId, monitoringEnabled]); // monitoringEnabled 의존성 추가

  // 정렬 변경 핸들러
  const handleSortChange = (field: SortField) => {
    if (sortBy === field) {
      // 같은 필드를 다시 클릭하면 정렬 방향 전환
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // 새로운 필드 선택 시 내림차순 기본
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  // 프로세스 선택/해제 핸들러
  const toggleProcessSelection = (pid: number) => {
    setSelectedProcesses(prev =>
      prev.includes(pid)
        ? prev.filter(id => id !== pid)
        : [...prev, pid]
    );
  };

  // 프로세스 종료 핸들러
  const handleKillProcess = async () => {
    if (!nodeId || selectedProcesses.length === 0 || !monitoringEnabled) return;
    if (!hasSshConnection) {
      alert('SSH 연결이 없어 프로세스를 종료할 수 없습니다. SSH 연결을 확인해주세요.');
      return;
    }

    if (!window.confirm(`선택한 ${selectedProcesses.length}개의 프로세스를 종료하시겠습니까?`)) {
      return;
    }

    try {
      // 각 선택된 프로세스에 대해 명령 전송
      const promises = selectedProcesses.map(pid => {
        const formData = {
          pid: pid,
          node_id: nodeId,
          google_id: sshConnection?.google_id || '',
          host: sshConnection?.host || '',
          port: sshConnection?.port || '22',
          user: sshConnection?.user || '',
          password: sshConnection?.password || '',
          key: sshConnection?.key || ''
        };

        return api.post('http://1.209.148.143:8000/ssh/kill_process', formData);
      });

      await Promise.all(promises);

      setSelectedProcesses([]);
      alert('선택한 프로세스 종료 명령이 전송되었습니다.');
    } catch (err) {
      console.error('프로세스 종료 실패:', err);
      alert('프로세스 종료 명령 전송에 실패했습니다.');
    }
  };

  // 프로세스 재시작 핸들러
  const handleRestartProcess = useCallback(async (process: Process) => {
    console.log('재시작 프로세스:', process.name); // 디버깅 로그
    if (!nodeId || !monitoringEnabled) return;
    if (!hasSshConnection) {
      alert('SSH 연결이 없어 프로세스를 재시작할 수 없습니다. SSH 연결을 확인해주세요.');
      return;
    }
    
    // 실제 재시작 로직은 나중에 구현
    alert(`${process.name} 프로세스 재시작 기능은 개발 중입니다.`);
  }, [nodeId, monitoringEnabled, hasSshConnection]);

  // 프로세스 중지 핸들러
  const handleStopProcess = useCallback(async (process: Process) => {
    console.log('중지 프로세스:', process.name); // 디버깅 로그
    if (!nodeId || !monitoringEnabled) return;
    if (!hasSshConnection) {
      alert('SSH 연결이 없어 프로세스를 중지할 수 없습니다. SSH 연결을 확인해주세요.');
      return;
    }

    if (!window.confirm(`"${process.name}" 프로세스를 중지하시겠습니까?`)) {
      return;
    }

    setProcessingAction({ pid: process.pid, action: 'stop' });

    try {
      const result = await api.post('http://1.209.148.143:8000/ssh/kill_process', {
        pid: process.pid,
        node_id: nodeId,
        google_id: sshConnection?.google_id || '',
        host: sshConnection?.host || '',
        port: sshConnection?.port || '22',
        user: sshConnection?.user || '',
        password: sshConnection?.password || '',
        key: sshConnection?.key || ''
      });

      console.log(result);
      alert(`${process.name} 프로세스 중지 명령이 전송되었습니다.`);
    } catch (err) {
      console.error('프로세스 중지 명령 전송 실패:', err);
      alert('프로세스 중지 명령 전송에 실패했습니다.');
    } finally {
      setProcessingAction(null);
    }
  }, [nodeId, monitoringEnabled, hasSshConnection, sshConnection]);

  // 우클릭 컨텍스트 메뉴 핸들러 - 화면 경계 처리 추가
  const handleRowRightClick = useCallback((e: React.MouseEvent, process: Process) => {
    console.log('우클릭 감지:', process.name, process.pid);
    e.preventDefault();
    e.stopPropagation();
    
    // 화면 크기 확인
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const menuWidth = 200; // 컨텍스트 메뉴 예상 너비
    const menuHeight = 120; // 컨텍스트 메뉴 예상 높이
    
    // 마우스 위치가 화면 경계에 가까우면 위치 조정
    let x = e.clientX;
    let y = e.clientY;
    
    if (x + menuWidth > windowWidth) {
      x = windowWidth - menuWidth - 10;
    }
    
    if (y + menuHeight > windowHeight) {
      y = windowHeight - menuHeight - 10;
    }
    
    setContextMenu({
      visible: true,
      x,
      y,
      process
    });
  }, []);

  // 컨텍스트 메뉴 닫기
  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, process: null });
  }, []);

  // 컨텍스트 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        closeContextMenu();
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('contextmenu', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
    };
  }, [contextMenu.visible, closeContextMenu]);

  // 컨텍스트 메뉴에서 작업 실행 - 의존성 배열 수정
  const handleContextMenuAction = useCallback((action: string, process: Process) => {
    closeContextMenu();
    
    switch (action) {
      case 'restart':
        handleRestartProcess(process);
        break;
      case 'stop':
        handleStopProcess(process);
        break;
      default:
        break;
    }
  }, [closeContextMenu, handleRestartProcess, handleStopProcess]); // 의존성 추가

  // 프로세스 필터링 및 정렬
  const filteredAndSortedProcesses = processes
    .filter(process => {
      if (!searchTerm) return true;

      const term = searchTerm.toLowerCase();
      return (
        process.name.toLowerCase().includes(term) ||
        process.user.toLowerCase().includes(term) ||
        process.pid.toString().includes(term) ||
        process.command.toLowerCase().includes(term) ||
        process.status.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      const fieldA = a[sortBy];
      const fieldB = b[sortBy];

      if (typeof fieldA === 'string' && typeof fieldB === 'string') {
        return sortDirection === 'asc'
          ? fieldA.localeCompare(fieldB)
          : fieldB.localeCompare(fieldA);
      }

      return sortDirection === 'asc'
        ? (fieldA as number) - (fieldB as number)
        : (fieldB as number) - (fieldA as number);
    });

  // 메모리 단위 변환
  const formatBytes = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // 프로세스 상태에 따른 스타일 클래스 반환
  const getStatusClass = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'running':
        return styles.statusRunning;
      case 'sleeping':
        return styles.statusSleeping;
      case 'idle':
        return styles.statusIdle;
      case 'zombie':
        return styles.statusZombie;
      case 'stopped':
        return styles.statusStopped;
      default:
        return '';
    }
  };

  // Unix 타임스탬프를 날짜 형식으로 변환
  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (loading && processes.length === 0 && monitoringEnabled) {
    return (
      <div className={styles.loadingContainer}>
        <p>⏳ 프로세스 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (error && monitoringEnabled) {
    return (
      <div className={styles.errorContainer}>
        <p>❌ {error}</p>
        <button
          onClick={() => window.location.reload()}
          className={styles.retryButton}
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 컨텍스트 메뉴 */}
      {contextMenu.visible && contextMenu.process && (
        <div
          className={styles.contextMenu}
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 1000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.contextMenuHeader}>
            <strong>{contextMenu.process.name}</strong>
            <span>PID: {contextMenu.process.pid}</span>
          </div>
          <div className={styles.contextMenuDivider}></div>
          <button
            className={`${styles.contextMenuItem} ${styles.restartItem}`}
            onClick={() => handleContextMenuAction('restart', contextMenu.process!)}
            disabled={processingAction?.pid === contextMenu.process.pid || !monitoringEnabled}
          >
            🔄 프로세스 재시작
          </button>
          <button
            className={`${styles.contextMenuItem} ${styles.stopItem}`}
            onClick={() => handleContextMenuAction('stop', contextMenu.process!)}
            disabled={processingAction?.pid === contextMenu.process.pid || !monitoringEnabled}
          >
            ⏹️ 프로세스 중지
          </button>
        </div>
      )}

      {/* 마우스 호버 툴팁 */}
      {tooltip && tooltip.visible && (
        <div
          className={styles.processTooltip}
          style={{
            position: 'fixed',
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            zIndex: 1000
          }}
        >
          {tooltip.loading ? (
            <div className={styles.tooltipLoading}>로딩 중...</div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: tooltip.content || '' }} />
          )}
        </div>
      )}

      {/* 모니터링 비활성화 상태 알림 */}
      {!monitoringEnabled && (
        <div className={styles.monitoringDisabled}>
          <p>모니터링이 비활성화되어 있습니다. 헤더에서 모니터링을 활성화해주세요.</p>
        </div>
      )}

      {/* 노드 정보 표시 헤더 추가 */}
      {/* {selectedNode && (
        <div className={styles.nodeHeader}>
          <h2>🖥️ {selectedNode.server_type} 노드 프로세스</h2>
          <div className={styles.nodeId}>ID: {nodeId}</div>
        </div>
      )} */}

      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2>🖥️ 프로세스 관리자</h2>
          <div className={styles.connectionStatus}>
            {!monitoringEnabled ? (
              <span className={styles.disconnected}>● 모니터링 비활성화</span>
            ) : connected ? (
              <span className={styles.connected}>● 실시간 모니터링 활성화</span>
            ) : (
              <span className={styles.disconnected}>● 연결 끊김</span>
            )}
            {!hasSshConnection && (
              <span className={styles.disconnected} style={{ marginLeft: '10px' }}>● SSH 연결 없음</span>
            )}
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder="프로세스 검색... (우클릭으로 작업 메뉴)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={!monitoringEnabled}
            />
          </div>

          <div className={styles.actionControls}>
            <div className={styles.columnSelector}>
              <button
                className={styles.columnToggleButton}
                disabled={!monitoringEnabled}
              >
                표시할 열 선택
              </button>
              <div className={styles.columnDropdown}>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('pid')}
                    onChange={() => toggleColumnVisibility('pid')}
                    disabled={!monitoringEnabled}
                  /> PID
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('ppid')}
                    onChange={() => toggleColumnVisibility('ppid')}
                    disabled={!monitoringEnabled}
                  /> PPID
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('name')}
                    onChange={() => toggleColumnVisibility('name')}
                    disabled={!monitoringEnabled}
                  /> 이름
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('user')}
                    onChange={() => toggleColumnVisibility('user')}
                    disabled={!monitoringEnabled}
                  /> 사용자
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('cpu_usage')}
                    onChange={() => toggleColumnVisibility('cpu_usage')}
                    disabled={!monitoringEnabled}
                  /> CPU 사용률
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('cpu_time')}
                    onChange={() => toggleColumnVisibility('cpu_time')}
                    disabled={!monitoringEnabled}
                  /> CPU 시간
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('memory_rss')}
                    onChange={() => toggleColumnVisibility('memory_rss')}
                    disabled={!monitoringEnabled}
                  /> 메모리 RSS
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('memory_vsz')}
                    onChange={() => toggleColumnVisibility('memory_vsz')}
                    disabled={!monitoringEnabled}
                  /> 메모리 VSZ
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('io_read_bytes')}
                    onChange={() => toggleColumnVisibility('io_read_bytes')}
                    disabled={!monitoringEnabled}
                  /> I/O 읽기
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('io_write_bytes')}
                    onChange={() => toggleColumnVisibility('io_write_bytes')}
                    disabled={!monitoringEnabled}
                  /> I/O 쓰기
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('threads')}
                    onChange={() => toggleColumnVisibility('threads')}
                    disabled={!monitoringEnabled}
                  /> 스레드
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('status')}
                    onChange={() => toggleColumnVisibility('status')}
                    disabled={!monitoringEnabled}
                  /> 상태
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('nice')}
                    onChange={() => toggleColumnVisibility('nice')}
                    disabled={!monitoringEnabled}
                  /> Nice 값
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('open_files')}
                    onChange={() => toggleColumnVisibility('open_files')}
                    disabled={!monitoringEnabled}
                  /> 열린 파일
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('start_time')}
                    onChange={() => toggleColumnVisibility('start_time')}
                    disabled={!monitoringEnabled}
                  /> 시작 시간
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes('command')}
                    onChange={() => toggleColumnVisibility('command')}
                    disabled={!monitoringEnabled}
                  /> 명령어
                </label>
              </div>
            </div>

            {selectedProcesses.length > 0 && monitoringEnabled && (
              <button
                className={styles.killButton}
                onClick={handleKillProcess}
              >
                선택한 프로세스 종료 ({selectedProcesses.length})
              </button>
            )}
          </div>
        </div>

        <div className={styles.stats}>
          <span>총 프로세스: {monitoringEnabled ? processes.length : '-'}</span>
          <span>표시된 프로세스: {monitoringEnabled ? filteredAndSortedProcesses.length : '-'}</span>
        </div>
      </div>

      <div className={styles.tableContainer}>
        {!monitoringEnabled ? (
          <div className={styles.noData}>모니터링이 비활성화되어 있습니다</div>
        ) : (
          <table className={styles.processTable}>
            <thead>
              <tr>
                <th className={styles.checkboxColumn}>
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProcesses(filteredAndSortedProcesses.map(p => p.pid));
                      } else {
                        setSelectedProcesses([]);
                      }
                    }}
                    checked={
                      filteredAndSortedProcesses.length > 0 &&
                      filteredAndSortedProcesses.every(p => selectedProcesses.includes(p.pid))
                    }
                    disabled={!monitoringEnabled}
                  />
                </th>

                {visibleColumns.includes('pid') && (
                  <th
                    className={sortBy === 'pid' ? styles.sorted : ''}
                    onClick={() => monitoringEnabled && handleSortChange('pid')}
                  >
                    PID {sortBy === 'pid' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                )}

                {visibleColumns.includes('ppid') && (
                  <th>PPID</th>
                )}

                {visibleColumns.includes('name') && (
                  <th
                    className={sortBy === 'name' ? styles.sorted : ''}
                    onClick={() => monitoringEnabled && handleSortChange('name')}
                  >
                    이름 {sortBy === 'name' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                )}

                {visibleColumns.includes('user') && (
                  <th
                    className={sortBy === 'user' ? styles.sorted : ''}
                    onClick={() => monitoringEnabled && handleSortChange('user')}
                  >
                    사용자 {sortBy === 'user' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                )}

                {visibleColumns.includes('cpu_usage') && (
                  <th
                    className={sortBy === 'cpu_usage' ? styles.sorted : ''}
                    onClick={() => monitoringEnabled && handleSortChange('cpu_usage')}
                  >
                    CPU % {sortBy === 'cpu_usage' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                )}

                {visibleColumns.includes('cpu_time') && (
                  <th
                    className={sortBy === 'cpu_time' ? styles.sorted : ''}
                    onClick={() => monitoringEnabled && handleSortChange('cpu_time')}
                  >
                    CPU 시간 {sortBy === 'cpu_time' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                )}

                {visibleColumns.includes('memory_rss') && (
                  <th
                    className={sortBy === 'memory_rss' ? styles.sorted : ''}
                    onClick={() => monitoringEnabled && handleSortChange('memory_rss')}
                  >
                    메모리 (RSS) {sortBy === 'memory_rss' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                )}

                {visibleColumns.includes('memory_vsz') && (
                  <th>메모리 (VSZ)</th>
                )}

                {visibleColumns.includes('io_read_bytes') && (
                  <th>I/O 읽기</th>
                )}

                {visibleColumns.includes('io_write_bytes') && (
                  <th>I/O 쓰기</th>
                )}

                {visibleColumns.includes('threads') && (
                  <th
                    className={sortBy === 'threads' ? styles.sorted : ''}
                    onClick={() => monitoringEnabled && handleSortChange('threads')}
                  >
                    스레드 {sortBy === 'threads' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                )}

                {visibleColumns.includes('status') && (
                  <th>상태</th>
                )}

                {visibleColumns.includes('nice') && (
                  <th>Nice</th>
                )}

                {visibleColumns.includes('open_files') && (
                  <th>열린 파일</th>
                )}

                {visibleColumns.includes('start_time') && (
                  <th
                    className={sortBy === 'start_time' ? styles.sorted : ''}
                    onClick={() => monitoringEnabled && handleSortChange('start_time')}
                  >
                    시작 시간 {sortBy === 'start_time' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                )}

                {visibleColumns.includes('command') && (
                  <th>명령어</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedProcesses.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className={styles.noData}>
                    {searchTerm ? '검색 결과가 없습니다.' : '표시할 프로세스가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedProcesses.map((process) => (
                  <tr
                    key={process.pid}
                    className={selectedProcesses.includes(process.pid) ? styles.selected : ''}
                    onContextMenu={(e) => {
                      console.log('onContextMenu 이벤트 발생'); // 디버깅 로그
                      handleRowRightClick(e, process);
                    }}
                    style={{ cursor: 'context-menu' }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedProcesses.includes(process.pid)}
                        onChange={() => toggleProcessSelection(process.pid)}
                        disabled={!monitoringEnabled}
                      />
                    </td>

                    {visibleColumns.includes('pid') && (
                      <td>{process.pid}</td>
                    )}

                    {visibleColumns.includes('ppid') && (
                      <td>{process.ppid}</td>
                    )}

                    {visibleColumns.includes('name') && (
                      <td
                        className={styles.processName}
                        onMouseEnter={(e) => handleProcessNameHover(e, process)}
                        onMouseLeave={handleProcessNameLeave}
                      >
                        {process.name}
                      </td>
                    )}

                    {visibleColumns.includes('user') && (
                      <td>{process.user}</td>
                    )}

                    {visibleColumns.includes('cpu_usage') && (
                      <td>
                        <div className={styles.progressBar}>
                          <div
                            className={`${styles.progressFill} ${process.cpu_usage > 75 ? styles.danger :
                              process.cpu_usage > 50 ? styles.warning : ''
                              }`}
                            style={{ width: `${Math.min(process.cpu_usage, 100)}%` }}
                          ></div>
                          <span>{process.cpu_usage.toFixed(1)}%</span>
                        </div>
                      </td>
                    )}

                    {visibleColumns.includes('cpu_time') && (
                      <td>{process.cpu_time.toFixed(2)}s</td>
                    )}

                    {visibleColumns.includes('memory_rss') && (
                      <td>{formatBytes(process.memory_rss)}</td>
                    )}

                    {visibleColumns.includes('memory_vsz') && (
                      <td>{formatBytes(process.memory_vsz)}</td>
                    )}

                    {visibleColumns.includes('io_read_bytes') && (
                      <td>{formatBytes(process.io_read_bytes)}</td>
                    )}

                    {visibleColumns.includes('io_write_bytes') && (
                      <td>{formatBytes(process.io_write_bytes)}</td>
                    )}

                    {visibleColumns.includes('threads') && (
                      <td>{process.threads}</td>
                    )}

                    {visibleColumns.includes('status') && (
                      <td>
                        <span className={getStatusClass(process.status)}>
                          {process.status}
                        </span>
                      </td>
                    )}

                    {visibleColumns.includes('nice') && (
                      <td>{process.nice}</td>
                    )}

                    {visibleColumns.includes('open_files') && (
                      <td>{process.open_files}</td>
                    )}

                    {visibleColumns.includes('start_time') && (
                      <td>{formatTimestamp(process.start_time)}</td>
                    )}

                    {visibleColumns.includes('command') && (
                      <td className={styles.command}>
                        <div className={styles.tooltip}>
                          {process.command.length > 30 ? process.command.substring(0, 30) + '...' : process.command}
                          {process.command.length > 30 && (
                            <span className={styles.tooltipText}>{process.command}</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ProcessView;