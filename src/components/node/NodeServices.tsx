import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import styles from '../../scss/node/NodeServices.module.scss';
import { useNodeContext } from '../../context/NodeContext';
import api from '../../api';
import { useSshContext } from '../../context/SshContext';
import { getToken } from '../../utils/Auth';

// 서비스 데이터 타입 정의
type Service = {
  name: string;
  display_name?: string;
  active_state: 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating' | string;
  enabled: boolean;
  load_state: 'loaded' | 'not-found' | 'bad-setting' | 'error' | string;
  status: string;
  sub_state: string;
  type: string;
  pid?: number | null;
};

// props 인터페이스
interface NodeServicesProps {
  nodeId?: string;
}

type SortField = 'name' | 'active_state' | 'status' | 'type' | 'sub_state';
type SortDirection = 'asc' | 'desc';

const NodeServices = ({ nodeId: propsNodeId }: NodeServicesProps = {}) => {
  // URL 파라미터에서 nodeId 가져오기
  const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();
  const { selectedNode, monitoringEnabled } = useNodeContext();

  // props > URL 파라미터 > 컨텍스트 순으로 nodeId 결정
  const nodeId = propsNodeId || paramNodeId || selectedNode?.node_id || '';

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [processingAction, setProcessingAction] = useState<{ name: string; action: string } | null>(null);

  // SSH Context 사용
  const {
    sshConnection,
    hasSshConnection,
    getSshConnection
  } = useSshContext();

  // WebSocket으로 서비스 데이터 가져오기
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

    if (!nodeId) {
      setError("유효한 노드 ID가 필요합니다. URL을 확인해주세요.");
      setLoading(false);
      return;
    }

    if (!monitoringEnabled) {
      setConnected(false);
      setLoading(false);
      return;
    }

    // 서비스 데이터를 가져오는 함수
    const fetchServices = async () => {
      try {
        // 실제 API 호출
        const response = await api.get(`/influx/services/${nodeId}`);
        if (response.data && response.data.services) {
          setServices(response.data.services);
          setError(null);
        } else {
          setError("서비스 데이터 형식이 잘못되었습니다.");
        }
      } catch (err) {
        console.error("서비스 데이터 가져오기 실패:", err);
        setError("서비스 데이터를 가져오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    // WebSocket 연결 설정
    const setupWebSocket = () => {
      const socket = new WebSocket(`ws://1.209.148.143:8000/influx/ws/services/${nodeId}`);

      socket.onopen = () => {
        console.log('서비스 모니터링 WebSocket 연결됨');
        setConnected(true);
        setError(null);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.services) {
            // InfluxDB에서 가져온 데이터를 변환
            const formattedServices: Service[] = data.services.map((service: any) => ({
              name: service.name || '알 수 없는 서비스',
              display_name: service.display_name || service.name || '알 수 없는 서비스',
              active_state: service.active_state || 'unknown',
              enabled: service.enabled === 'enabled' || service.enabled === true,
              load_state: service.load_state || 'unknown',
              status: service.status || 'unknown',
              sub_state: service.sub_state || '',
              type: service.type || 'service',
              pid: service.pid || null
            }));

            setServices(formattedServices);
            setLoading(false);
            setError(null);
          }
        } catch (err) {
          console.error('WebSocket 메시지 파싱 실패:', err);
          setError('데이터 수신 중 오류가 발생했습니다.');
        }
      };

      socket.onerror = (err) => {
        console.error('WebSocket 에러:', err);
        setError('WebSocket 연결 실패');
        setConnected(false);

        // REST API로 대체
        fetchServices();
      };

      socket.onclose = () => {
        console.log('WebSocket 연결 종료 - 서비스 모니터링');
        setConnected(false);
      };

      return socket;
    };

    // 이 시점에서는 WebSocket을 사용
    const socket = setupWebSocket();

    // 연결 실패 시 REST API를 사용하는 타임아웃 설정
    const timeoutId = setTimeout(() => {
      if (!connected && monitoringEnabled) {
        console.log('WebSocket 연결 타임아웃, REST API로 전환');
        fetchServices();
      }
    }, 3000);

    return () => {
      clearTimeout(timeoutId);
      if (socket) {
        socket.close();
      }
    };
  }, [nodeId, monitoringEnabled]);

  // 정렬 변경 핸들러
  const handleSortChange = (field: SortField) => {
    if (sortBy === field) {
      // 같은 필드를 다시 클릭하면 정렬 방향 전환
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // 새로운 필드 선택 시 오름차순 기본
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  // 서비스 선택/해제 핸들러
  const toggleServiceSelection = (name: string) => {
    setSelectedServices(prev =>
      prev.includes(name)
        ? prev.filter(n => n !== name)
        : [...prev, name]
    );
  };

  // 서비스 시작 핸들러
  const handleStartService = async (service: Service) => {
    if (!nodeId || !monitoringEnabled || !hasSshConnection) return;

    if (!window.confirm(`"${service.name}" 서비스를 시작하시겠습니까?`)) {
      return;
    }

    setProcessingAction({ name: service.name, action: 'start' });

    try {
      // API 호출
      const data = {
        service_name: service.name,
        node_id: nodeId,
        google_id: sshConnection?.google_id || '',
        host: sshConnection?.host || '',
        port: sshConnection?.port || '22',
        user: sshConnection?.user || '',
        password: sshConnection?.password || '',
        key: sshConnection?.key || ''
      }
      // API 호출
      const response = await api.post(`/ssh/start_service`, data);
      console.log(response);

      if (response.data && response.data.success) {
        // 서비스 상태 업데이트
        // setServices(prev => prev.map(s =>
        //   s.name === service.name
        //     ? { ...s, active_state: 'active', sub_state: 'running' }
        //     : s
        // ));

        alert(`${service.name} 서비스가 시작되었습니다.`);
      } else {
        throw new Error(response.data.error || '서비스 시작에 실패했습니다');
      }
    } catch (err) {
      console.error('서비스 시작 명령 전송 실패:', err);
      alert('서비스 시작 명령 전송에 실패했습니다.');
    } finally {
      setProcessingAction(null);
    }
  };

  // 서비스 중지 핸들러
  const handleStopService = async (service: Service) => {
    if (!nodeId || !monitoringEnabled) return;

    if (!window.confirm(`"${service.name}" 서비스를 중지하시겠습니까?`)) {
      return;
    }

    setProcessingAction({ name: service.name, action: 'stop' });

    try {
      const data = {
        service_name: service.name,
        node_id: nodeId,
        google_id: sshConnection?.google_id || '',
        host: sshConnection?.host || '',
        port: sshConnection?.port || '22',
        user: sshConnection?.user || '',
        password: sshConnection?.password || '',
        key: sshConnection?.key || ''
      }
      // API 호출
      const response = await api.post(`/ssh/stop_service`, data);
      console.log(response);

      if (response.data && response.data.success) {
        // 서비스 상태 업데이트
        // setServices(prev => prev.map(s =>
        //   s.name === service.name
        //     ? { ...s, active_state: 'inactive', sub_state: 'dead' }
        //     : s
        // ));

        alert(`${service.name} 서비스가 중지되었습니다.`);
      } else {
        throw new Error(response.data.error || '서비스 중지에 실패했습니다');
      }
    } catch (err) {
      console.error('서비스 중지 명령 전송 실패:', err);
      alert('서비스 중지 명령 전송에 실패했습니다.');
    } finally {
      setProcessingAction(null);
    }
  };

  // 서비스 재시작 핸들러
  const handleRestartService = async (service: Service) => {
    if (!nodeId || !monitoringEnabled) return;

    if (!window.confirm(`"${service.name}" 서비스를 재시작하시겠습니까?`)) {
      return;
    }

    setProcessingAction({ name: service.name, action: 'restart' });

    try {
      const data = {
        service_name: service.name,
        node_id: nodeId,
        google_id: sshConnection?.google_id || '',
        host: sshConnection?.host || '',
        port: sshConnection?.port || '22',
        user: sshConnection?.user || '',
        password: sshConnection?.password || '',
        key: sshConnection?.key || ''
      }
      // API 호출
      const response = await api.post(`/ssh/restart_service`, data);
      console.log(response);

      if (response.data && response.data.success) {
        // 서비스 상태 업데이트 (실제로는 서버에서 상태 변경 통지가 오기를 기다려야 함)
        // setServices(prev => prev.map(s =>
        //   s.name === service.name
        //     ? { ...s, active_state: 'active', sub_state: 'running' }
        //     : s
        // ));

        alert(`${service.name} 서비스가 재시작되었습니다.`);
      } else {
        throw new Error(response.data.error || '서비스 재시작에 실패했습니다');
      }
    } catch (err) {
      console.error('서비스 재시작 명령 전송 실패:', err);
      alert('서비스 재시작 명령 전송에 실패했습니다.');
    } finally {
      setProcessingAction(null);
    }
  };

  // 선택된 서비스 일괄 시작
  const handleStartSelectedServices = async () => {
    if (selectedServices.length === 0) return;

    if (!window.confirm(`선택한 ${selectedServices.length}개의 서비스를 시작하시겠습니까?`)) {
      return;
    }

    try {
      // API 호출
      const response = await api.post(`/api/node/${nodeId}/services/start`, {
        services: selectedServices
      });

      if (response.data && response.data.success) {
        // 서비스 상태 업데이트
        setServices(prev => prev.map(s =>
          selectedServices.includes(s.name)
            ? { ...s, active_state: 'active', sub_state: 'running' }
            : s
        ));

        alert(`${selectedServices.length}개의 서비스가 시작되었습니다.`);
        setSelectedServices([]);
      } else {
        throw new Error(response.data.error || '일괄 서비스 시작에 실패했습니다');
      }
    } catch (err) {
      console.error('서비스 일괄 시작 실패:', err);
      alert('서비스 시작 명령 전송에 실패했습니다.');
    }
  };

  // 선택된 서비스 일괄 중지
  const handleStopSelectedServices = async () => {
    if (selectedServices.length === 0) return;

    if (!window.confirm(`선택한 ${selectedServices.length}개의 서비스를 중지하시겠습니까?`)) {
      return;
    }

    try {
      // API 호출
      const response = await api.post(`/api/node/${nodeId}/services/stop`, {
        services: selectedServices
      });

      if (response.data && response.data.success) {
        // 서비스 상태 업데이트
        setServices(prev => prev.map(s =>
          selectedServices.includes(s.name)
            ? { ...s, active_state: 'inactive', sub_state: 'dead' }
            : s
        ));

        alert(`${selectedServices.length}개의 서비스가 중지되었습니다.`);
        setSelectedServices([]);
      } else {
        throw new Error(response.data.error || '일괄 서비스 중지에 실패했습니다');
      }
    } catch (err) {
      console.error('서비스 일괄 중지 실패:', err);
      alert('서비스 중지 명령 전송에 실패했습니다.');
    }
  };

  // 서비스 필터링 및 정렬
  const filteredAndSortedServices = services
    .filter(service => {
      if (!searchTerm) return true;

      const term = searchTerm.toLowerCase();
      return (
        service.name.toLowerCase().includes(term) ||
        (service.display_name || '').toLowerCase().includes(term) ||
        service.active_state.toLowerCase().includes(term) ||
        service.type.toLowerCase().includes(term) ||
        service.status.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      // 문자열 필드의 정렬
      const fieldA = String(a[sortBy]).toLowerCase();
      const fieldB = String(b[sortBy]).toLowerCase();

      return sortDirection === 'asc'
        ? fieldA.localeCompare(fieldB)
        : fieldB.localeCompare(fieldA);
    });

  // 서비스 상태에 따른 스타일 클래스 반환
  const getStatusClass = (active_state: string): string => {
    switch (active_state.toLowerCase()) {
      case 'active':
        return styles.statusRunning;
      case 'inactive':
        return styles.statusStopped;
      case 'failed':
        return styles.statusFailed;
      case 'activating':
        return styles.statusStarting;
      case 'deactivating':
        return styles.statusStopping;
      default:
        return styles.statusUnknown;
    }
  };

  // 상태 한글화
  const translateStatus = (active_state: string, sub_state: string): string => {
    let status;

    switch (active_state.toLowerCase()) {
      case 'active': status = '실행 중'; break;
      case 'inactive': status = '중지됨'; break;
      case 'failed': status = '실패'; break;
      case 'activating': status = '시작 중'; break;
      case 'deactivating': status = '중지 중'; break;
      default: status = active_state;
    }

    return sub_state ? `${status} (${sub_state})` : status;
  };

  if (loading && services.length === 0 && monitoringEnabled) {
    return (
      <div className={styles.loadingContainer}>
        <p>⏳ 서비스 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2>⚙️ 서비스 관리</h2>
          <div className={styles.connectionStatus}>
            {!monitoringEnabled ? (
              <span className={styles.disconnected}>● 모니터링 비활성화</span>
            ) : connected ? (
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
              placeholder="서비스 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={!monitoringEnabled}
            />
          </div>

          <div className={styles.actionControls}>
            {selectedServices.length > 0 && monitoringEnabled && (
              <>
                <button
                  className={styles.startButton}
                  onClick={handleStartSelectedServices}
                >
                  선택한 서비스 시작 ({selectedServices.length})
                </button>
                <button
                  className={styles.stopButton}
                  onClick={handleStopSelectedServices}
                >
                  선택한 서비스 중지 ({selectedServices.length})
                </button>
              </>
            )}
          </div>
        </div>

        <div className={styles.stats}>
          <span>총 서비스: {monitoringEnabled ? services.length : '-'}</span>
          <span>표시된 서비스: {monitoringEnabled ? filteredAndSortedServices.length : '-'}</span>
          <span>실행 중: {monitoringEnabled ? services.filter(s => s.active_state === 'active').length : '-'}</span>
          <span>중지됨: {monitoringEnabled ? services.filter(s => s.active_state === 'inactive').length : '-'}</span>
          <span>실패: {monitoringEnabled ? services.filter(s => s.active_state === 'failed').length : '-'}</span>
        </div>
      </div>

      <div className={styles.tableContainer}>
        {!monitoringEnabled ? (
          <div className={styles.noData}>모니터링이 비활성화되어 있습니다</div>
        ) : error ? (
          <div className={styles.errorContainer}>
            <p>❌ {error}</p>
            <button
              onClick={() => window.location.reload()}
              className={styles.retryButton}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <table className={styles.serviceTable}>
            <thead>
              <tr>
                <th className={styles.checkboxColumn}>
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedServices(filteredAndSortedServices.map(s => s.name));
                      } else {
                        setSelectedServices([]);
                      }
                    }}
                    checked={
                      filteredAndSortedServices.length > 0 &&
                      filteredAndSortedServices.every(s => selectedServices.includes(s.name))
                    }
                    disabled={!monitoringEnabled}
                  />
                </th>

                <th
                  className={sortBy === 'name' ? styles.sorted : ''}
                  onClick={() => monitoringEnabled && handleSortChange('name')}
                >
                  이름 {sortBy === 'name' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>

                <th
                  className={sortBy === 'type' ? styles.sorted : ''}
                  onClick={() => monitoringEnabled && handleSortChange('type')}
                >
                  유형 {sortBy === 'type' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>

                <th
                  className={sortBy === 'active_state' ? styles.sorted : ''}
                  onClick={() => monitoringEnabled && handleSortChange('active_state')}
                >
                  상태 {sortBy === 'active_state' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>

                <th
                  className={sortBy === 'sub_state' ? styles.sorted : ''}
                  onClick={() => monitoringEnabled && handleSortChange('sub_state')}
                >
                  세부 상태 {sortBy === 'sub_state' && (sortDirection === 'asc' ? '▲' : '▼')}
                </th>

                <th>
                  활성화 여부
                </th>

                <th>
                  로드 상태
                </th>

                <th className={styles.actionsColumn}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedServices.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.noData}>
                    {searchTerm ? '검색 결과가 없습니다.' : '표시할 서비스가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedServices.map((service) => (
                  <tr
                    key={service.name}
                    className={selectedServices.includes(service.name) ? styles.selected : ''}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedServices.includes(service.name)}
                        onChange={() => toggleServiceSelection(service.name)}
                        disabled={!monitoringEnabled}
                      />
                    </td>

                    <td className={styles.serviceName}>
                      <div className={styles.serviceNameWithIcon}>
                        <span className={styles.serviceIcon}>⚙️</span>
                        {service.display_name || service.name}
                      </div>
                      <div className={styles.serviceId}>{service.name}</div>
                    </td>

                    <td>{service.type}</td>

                    <td>
                      <span className={getStatusClass(service.active_state)}>
                        {translateStatus(service.active_state, '')}
                      </span>
                    </td>

                    <td>{service.sub_state}</td>

                    <td>
                      <span className={service.enabled ? styles.enabled : styles.disabled}>
                        {service.enabled ? '활성화됨' : '비활성화됨'}
                      </span>
                    </td>

                    <td>{service.load_state}</td>

                    <td className={styles.actionsCell}>
                      <div className={styles.actionButtons}>
                        {(service.active_state === 'inactive' || service.active_state === 'failed') && (
                          <button
                            className={`${styles.actionButton} ${styles.startButton}`}
                            onClick={() => handleStartService(service)}
                            disabled={processingAction?.name === service.name || !monitoringEnabled}
                            title="서비스 시작"
                          >
                            {processingAction?.name === service.name && processingAction?.action === 'start'
                              ? '처리 중...'
                              : '시작'}
                          </button>
                        )}

                        {service.active_state === 'active' && (
                          <>
                            <button
                              className={`${styles.actionButton} ${styles.restartButton}`}
                              onClick={() => handleRestartService(service)}
                              disabled={processingAction?.name === service.name || !monitoringEnabled}
                              title="서비스 재시작"
                            >
                              {processingAction?.name === service.name && processingAction?.action === 'restart'
                                ? '처리 중...'
                                : '재시작'}
                            </button>
                            <button
                              className={`${styles.actionButton} ${styles.stopButton}`}
                              onClick={() => handleStopService(service)}
                              disabled={processingAction?.name === service.name || !monitoringEnabled}
                              title="서비스 중지"
                            >
                              {processingAction?.name === service.name && processingAction?.action === 'stop'
                                ? '처리 중...'
                                : '중지'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
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

export default NodeServices;