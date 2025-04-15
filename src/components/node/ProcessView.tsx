import { useState, useEffect } from 'react';
import styles from '../../scss/node/ProcessView.module.scss';

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

interface NodeMetricsProps {
  nodeId: string;
}

type SortField = 'pid' | 'name' | 'user' | 'cpu_usage' | 'memory_rss' | 'cpu_time' | 'threads' | 'start_time';
type SortDirection = 'asc' | 'desc';

const ProcessView = ({ nodeId }: NodeMetricsProps) => {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('cpu_usage');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedProcesses, setSelectedProcesses] = useState<number[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'pid', 'name', 'user', 'cpu_usage', 'memory_rss', 'status', 'start_time', 'command'
  ]);

  // Toggle column visibility
  const toggleColumnVisibility = (column: string) => {
    setVisibleColumns(prev => 
      prev.includes(column) 
        ? prev.filter(c => c !== column) 
        : [...prev, column]
    );
  };

  // WebSocket으로 프로세스 데이터 가져오기
  useEffect(() => {
    // nodeId가 없으면 로딩 상태 유지, 오류 메시지 표시
    if (!nodeId) {
      setError("유효한 노드 ID가 필요합니다. URL을 확인해주세요.");
      setLoading(false);
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
  }, [nodeId]);
  
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
    if (!nodeId || selectedProcesses.length === 0) return;
    
    if (!window.confirm(`선택한 ${selectedProcesses.length}개의 프로세스를 종료하시겠습니까?`)) {
      return;
    }
    
    try {
      // WebSocket을 통해 프로세스 종료 명령 전송
      const commandSocket = new WebSocket(`ws://1.209.148.143:8000/influx/ws/commands/${nodeId}`);
      
      commandSocket.onopen = () => {
        commandSocket.send(JSON.stringify({
          command: 'kill_processes',
          pids: selectedProcesses
        }));
      };
      
      commandSocket.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.status === 'success') {
          setSelectedProcesses([]);
          alert('선택한 프로세스가 성공적으로 종료되었습니다.');
        } else {
          alert('프로세스 종료에 실패했습니다: ' + response.message);
        }
        commandSocket.close();
      };
      
      commandSocket.onerror = () => {
        alert('프로세스 종료 요청 전송에 실패했습니다.');
        commandSocket.close();
      };
    } catch (err) {
      console.error('프로세스 종료 실패:', err);
      alert('프로세스 종료에 실패했습니다.');
    }
  };
  
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

  if (loading && processes.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <p>⏳ 프로세스 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
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
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2>🖥️ 프로세스 관리자</h2>
          <div className={styles.connectionStatus}>
            {connected ? (
              <span className={styles.connected}>● 실시간 모니터링 활성화</span>
            ) : (
              <span className={styles.disconnected}>● 연결 끊김</span>
            )}
          </div>
        </div>
        
        <div className={styles.controls}>
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder="프로세스 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className={styles.actionControls}>
            <div className={styles.columnSelector}>
              <button className={styles.columnToggleButton}>표시할 열 선택</button>
              <div className={styles.columnDropdown}>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('pid')}
                    onChange={() => toggleColumnVisibility('pid')}
                  /> PID
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('ppid')}
                    onChange={() => toggleColumnVisibility('ppid')}
                  /> PPID
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('name')}
                    onChange={() => toggleColumnVisibility('name')}
                  /> 이름
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('user')}
                    onChange={() => toggleColumnVisibility('user')}
                  /> 사용자
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('cpu_usage')}
                    onChange={() => toggleColumnVisibility('cpu_usage')}
                  /> CPU 사용률
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('cpu_time')}
                    onChange={() => toggleColumnVisibility('cpu_time')}
                  /> CPU 시간
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('memory_rss')}
                    onChange={() => toggleColumnVisibility('memory_rss')}
                  /> 메모리 RSS
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('memory_vsz')}
                    onChange={() => toggleColumnVisibility('memory_vsz')}
                  /> 메모리 VSZ
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('io_read_bytes')}
                    onChange={() => toggleColumnVisibility('io_read_bytes')}
                  /> I/O 읽기
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('io_write_bytes')}
                    onChange={() => toggleColumnVisibility('io_write_bytes')}
                  /> I/O 쓰기
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('threads')}
                    onChange={() => toggleColumnVisibility('threads')}
                  /> 스레드
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('status')}
                    onChange={() => toggleColumnVisibility('status')}
                  /> 상태
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('nice')}
                    onChange={() => toggleColumnVisibility('nice')}
                  /> Nice 값
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('open_files')}
                    onChange={() => toggleColumnVisibility('open_files')}
                  /> 열린 파일
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('start_time')}
                    onChange={() => toggleColumnVisibility('start_time')}
                  /> 시작 시간
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.includes('command')}
                    onChange={() => toggleColumnVisibility('command')}
                  /> 명령어
                </label>
              </div>
            </div>
            
            {selectedProcesses.length > 0 && (
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
          <span>총 프로세스: {processes.length}</span>
          <span>표시된 프로세스: {filteredAndSortedProcesses.length}</span>
        </div>
      </div>
      
      <div className={styles.tableContainer}>
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
                />
              </th>
              
              {visibleColumns.includes('pid') && (
                <th 
                  className={sortBy === 'pid' ? styles.sorted : ''} 
                  onClick={() => handleSortChange('pid')}
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
                  onClick={() => handleSortChange('name')}
                >
                  이름 {sortBy === 'name' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
              )}
              
              {visibleColumns.includes('user') && (
                <th 
                  className={sortBy === 'user' ? styles.sorted : ''} 
                  onClick={() => handleSortChange('user')}
                >
                  사용자 {sortBy === 'user' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
              )}
              
              {visibleColumns.includes('cpu_usage') && (
                <th 
                  className={sortBy === 'cpu_usage' ? styles.sorted : ''} 
                  onClick={() => handleSortChange('cpu_usage')}
                >
                  CPU % {sortBy === 'cpu_usage' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
              )}
              
              {visibleColumns.includes('cpu_time') && (
                <th 
                  className={sortBy === 'cpu_time' ? styles.sorted : ''} 
                  onClick={() => handleSortChange('cpu_time')}
                >
                  CPU 시간 {sortBy === 'cpu_time' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>
              )}
              
              {visibleColumns.includes('memory_rss') && (
                <th 
                  className={sortBy === 'memory_rss' ? styles.sorted : ''} 
                  onClick={() => handleSortChange('memory_rss')}
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
                  onClick={() => handleSortChange('threads')}
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
                  onClick={() => handleSortChange('start_time')}
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
                >
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selectedProcesses.includes(process.pid)} 
                      onChange={() => toggleProcessSelection(process.pid)}
                    />
                  </td>
                  
                  {visibleColumns.includes('pid') && (
                    <td>{process.pid}</td>
                  )}
                  
                  {visibleColumns.includes('ppid') && (
                    <td>{process.ppid}</td>
                  )}
                  
                  {visibleColumns.includes('name') && (
                    <td className={styles.processName}>{process.name}</td>
                  )}
                  
                  {visibleColumns.includes('user') && (
                    <td>{process.user}</td>
                  )}
                  
                  {visibleColumns.includes('cpu_usage') && (
                    <td>
                      <div className={styles.progressBar}>
                        <div 
                          className={`${styles.progressFill} ${
                            process.cpu_usage > 75 ? styles.danger : 
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
      </div>
    </div>
  );
};

export default ProcessView;