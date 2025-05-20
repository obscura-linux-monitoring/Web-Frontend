import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import styles from '../../scss/performance/DiskMonitor.module.scss';
import { useLocation, useParams } from 'react-router-dom';
import { useNodeContext } from '../../context/NodeContext';
import { useAuth } from '../../hooks/useAuth';
import { getToken } from '../../utils/Auth';

// ===== 상수 정의 =====
const SERVER_URL = 'ws://1.209.148.143:8000';
const MAX_RECONNECT_ATTEMPTS = 3; // 최대 재연결 시도 횟수
const RECONNECT_DELAY = 3000; // 재연결 지연 시간 (ms)
const DATA_TIMEOUT = 5000; // 데이터 수신 타임아웃 (ms)

// ===== 인터페이스 정의 =====
interface DiskData {
  // 디스크 기본 정보
  device: string;  // 디바이스 이름 (C:)
  model: string;   // 모델명
  
  // 사용량 정보
  usage_percent: number;
  total: number;   // GB 단위
  free: number;    // GB 단위
  used: number;    // GB 단위
  
  // 성능 정보
  read_speed: number;     // MB/s
  write_speed: number;    // MB/s
  active_time: number;    // %
  response_time: number;  // ms
  
  // 시스템 정보
  is_system_disk: boolean;
  has_page_file: boolean;
  filesystem_type: string;
  interface_type: string; // SSD(NVMe) 등
}

interface DiskActivityPoint {
  time: number;
  activity: number;
}

interface DiskSpeedPoint {
  time: number;
  read: number;
  write: number;
}

interface DiskMonitorProps {
  nodeId?: string;
  device: string; // 장치명을 필수로 변경
}

// ===== 웹소켓 상태 열거형 =====
enum ConnectionState {
  DISCONNECTED,   // 연결되지 않음
  CONNECTING,     // 연결 중
  CONNECTED,      // 연결됨
  RECONNECTING,   // 재연결 중
  ERROR,          // 오류 상태
  CLEANING        // 정리 중
}

const DiskMonitor = ({ nodeId: propsNodeId, device }: DiskMonitorProps) => {
  const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();
  const { selectedNode, monitoringEnabled = true } = useNodeContext();
  const { isAuthenticated = true } = useAuth();
  const location = useLocation();
  
  const nodeId = propsNodeId || paramNodeId || selectedNode?.node_id || '';
  
  // ===== 상태 정의 =====
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [dataReceived, setDataReceived] = useState<boolean>(false);
  
  const [diskData, setDiskData] = useState<DiskData>({
    device: "",
    model: "불러오는 중...",
    usage_percent: 0,
    total: 0,
    free: 0,
    used: 0,
    read_speed: 0,
    write_speed: 0,
    active_time: 0,
    response_time: 0,
    is_system_disk: false,
    has_page_file: false,
    filesystem_type: "Unknown",
    interface_type: "Unknown"
  });
  
  const [activityHistory, setActivityHistory] = useState<DiskActivityPoint[]>([]);
  const [speedHistory, setSpeedHistory] = useState<DiskSpeedPoint[]>([]);
  const [maxPoints] = useState<number>(60);  // 60초 데이터
  const [maxSpeed, setMaxSpeed] = useState<number>(250); // 초기 최대 속도 설정
  
  // ===== refs 정의 =====
  const isMounted = useRef(true);
  const socketRef = useRef<WebSocket | null>(null);
  const timeCounterRef = useRef<number>(0);
  const currentDeviceRef = useRef<string>(device);
  const initialMountRef = useRef<boolean>(true); // 최초 마운트 체크용
  const connectionStatusRef = useRef<string>("연결 준비 중...");
  const deviceChangeTimerRef = useRef<number | null>(null); // 장치 변경 타이머 참조
  
  // 웹소켓 연결 상태 관리
  const connectionManagerRef = useRef({
    state: ConnectionState.DISCONNECTED,
    reconnectAttempts: 0,
    timers: new Map<string, number>(),
    pendingDevice: null as string | null,
    lastConnectionDevice: null as string | null, // 마지막 연결 장치
    deviceChanging: false // 장치 변경 중 상태
  });

  // ===== 유틸리티 함수 =====
  
  // 타이머 관리 함수
  const setConnectionTimer = useCallback((id: string, callback: () => void, delay: number) => {
    // 기존 타이머가 있으면 제거
    clearConnectionTimer(id);
    // 새 타이머 설정
    const timerId = window.setTimeout(() => {
      connectionManagerRef.current.timers.delete(id);
      if (isMounted.current) callback();
    }, delay);
    // 타이머 저장
    connectionManagerRef.current.timers.set(id, timerId);
    return timerId;
  }, []);

  const clearConnectionTimer = useCallback((id: string) => {
    const timerId = connectionManagerRef.current.timers.get(id);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      connectionManagerRef.current.timers.delete(id);
    }
  }, []);

  // 모든 타이머 정리
  const clearAllTimers = useCallback(() => {
    const { timers } = connectionManagerRef.current;
    timers.forEach((timerId) => clearTimeout(timerId));
    timers.clear();
    
    // 장치 변경 타이머도 정리
    if (deviceChangeTimerRef.current !== null) {
      clearTimeout(deviceChangeTimerRef.current);
      deviceChangeTimerRef.current = null;
    }
  }, []);

  // 데이터 초기화 함수
  const clearAllData = useCallback(() => {
    console.log(`디스크 데이터 초기화 (장치: ${device})`);
    setActivityHistory([]);
    setSpeedHistory([]);
    timeCounterRef.current = 0;
    setDataReceived(false);
    connectionManagerRef.current.reconnectAttempts = 0;
  }, [device]);

  // ===== 웹소켓 연결 관리 함수 =====
  
  // 웹소켓 정리 함수 (Promise 반환)
  const cleanupConnection = useCallback(() => {
    // 연결이 없으면 패스 (불필요한 정리 방지)
    if (!socketRef.current && connectionManagerRef.current.state === ConnectionState.DISCONNECTED) {
      console.log(`정리할 연결 없음 - 장치: ${currentDeviceRef.current}`);
      return Promise.resolve(); // 빈 Promise 반환
    }
    
    return new Promise<void>((resolve) => {
      console.log(`연결 정리 시작 - 장치: ${currentDeviceRef.current}`);
      
      // 이미 정리 중이면 중복 실행 방지
      if (connectionManagerRef.current.state === ConnectionState.CLEANING) {
        console.log("이미 정리 중입니다. 중복 정리 건너뜀.");
        setTimeout(resolve, 100); // 다음 작업이 진행되도록 짧은 지연 후 resolve
        return;
      }
      
      // 정리 중 상태로 설정
      connectionManagerRef.current.state = ConnectionState.CLEANING;
      
      // 모든 타이머 정리
      clearAllTimers();
      
      // WebSocket 정리
      if (socketRef.current) {
        try {
          const socket = socketRef.current;
          // 모든 이벤트 핸들러 제거
          socket.onopen = null;
          socket.onmessage = null;
          socket.onerror = null;
          socket.onclose = null;
          
          // 웹소켓이 열려있거나 연결 중이면 닫기
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(1000, `연결 정리: ${currentDeviceRef.current}`);
          }
        } catch (err) {
          console.warn(`WebSocket 정리 중 오류:`, err);
        }
        
        // 웹소켓 참조 제거
        socketRef.current = null;
        setConnected(false);
      }
      
      // 정리 완료 후에 상태 업데이트 및 Promise 해결
      connectionManagerRef.current.state = ConnectionState.DISCONNECTED;
      
      // 대기 중인 장치가 있으면 새 연결 시작
      const pendingDevice = connectionManagerRef.current.pendingDevice;
      if (pendingDevice && isMounted.current) {
        console.log(`대기 중이던 장치 ${pendingDevice} 연결 시작`);
        connectionManagerRef.current.pendingDevice = null;
        connectionManagerRef.current.reconnectAttempts = 0;
        
        // Promise가 해결된 후 새 장치 연결 시작
        setTimeout(() => {
          if (isMounted.current) createConnection();
          resolve();
        }, 150);
      } else {
        // 보류 중인 장치가 없는 경우 지연 후 Promise 해결
        setTimeout(() => {
          console.log(`연결 정리 완료 - 장치: ${currentDeviceRef.current}`);
          resolve();
        }, 100);
      }
    });
  }, [clearAllTimers]);

  // 웹소켓 생성 함수 (connectToServer 대체)
  const createConnection = useCallback(() => {
    // 이미 연결 중이거나 정리 중이면 대기
    if (connectionManagerRef.current.state === ConnectionState.CONNECTING ||
        connectionManagerRef.current.state === ConnectionState.CLEANING) {
      console.log(`연결 중 또는 정리 중 - 장치 ${device} 연결 대기`);
      connectionManagerRef.current.pendingDevice = device;
      return;
    }
    
    // 장치 변경 중이면 대기
    if (connectionManagerRef.current.deviceChanging) {
      console.log(`장치 변경 중 - 장치 ${device} 연결 대기`);
      connectionManagerRef.current.pendingDevice = device;
      return;
    }
    
    // 이미 연결된 상태고 같은 장치라면 중복 연결 방지
    if (connectionManagerRef.current.state === ConnectionState.CONNECTED && 
        socketRef.current && 
        currentDeviceRef.current.trim() === device.trim() &&
        connectionManagerRef.current.lastConnectionDevice === device) {
      console.log(`이미 ${device}에 연결되어 있음, 중복 연결 방지`);
      setLoading(false); // 로딩 상태 해제 (이미 연결됨)
      return;
    }
    
    // 연결이 불가능한 상태인 경우 종료
    if (!isMounted.current || !monitoringEnabled || !nodeId) {
      console.log("연결 불가능 상태 - 연결 시도 중단");
      setLoading(false);
      return;
    }
    
    console.log(`서버 연결 시작 - 장치: ${device}`);
    connectionManagerRef.current.state = ConnectionState.CONNECTING;
    connectionStatusRef.current = "서버에 연결 중...";
    
    // 마지막 연결 장치 업데이트
    connectionManagerRef.current.lastConnectionDevice = device;
    
    try {
      const token = getToken();
      if (!token) {
        setError("인증 토큰을 찾을 수 없습니다.");
        setLoading(false);
        connectionManagerRef.current.state = ConnectionState.ERROR;
        return;
      }
      
      // WebSocket URL 구성
      let wsUrl = `${SERVER_URL}/performance/ws/disk/${nodeId}?token=${token}`;
      
      if (device) {
        wsUrl += `&device=${encodeURIComponent(device)}`;
      } else {
        setError("디스크 장치명이 지정되지 않았습니다.");
        setLoading(false);
        connectionManagerRef.current.state = ConnectionState.ERROR;
        return;
      }
      
      // 웹소켓 생성
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      
      // 데이터 수신 타임아웃 설정
      setConnectionTimer('dataTimeout', () => {
        if (isMounted.current && !dataReceived && device === currentDeviceRef.current) {
          console.warn(`데이터 수신 타임아웃 - 장치: ${device}`);
          setError(`데이터 수신 대기 시간 초과. 다시 시도해주세요.`);
          setLoading(false);
          
          // 연결 종료
          if (socketRef.current) {
            socketRef.current.close(1000, "데이터 타임아웃");
          }
          
          // 일정 시간 후에 재연결 시도 (재시도 횟수 초과 검사 포함)
          connectionManagerRef.current.state = ConnectionState.ERROR;
          handleReconnect();
        }
      }, DATA_TIMEOUT);
      
      // 이벤트 핸들러 설정
      socket.onopen = () => {
        if (!isMounted.current) {
          socket.close(1000, "컴포넌트 언마운트");
          return;
        }
        
        // 장치가 변경되었는지 확인
        if (device.trim() !== currentDeviceRef.current.trim()) {
          console.log(`연결 중 장치 변경됨: ${device} -> ${currentDeviceRef.current}, 연결 종료`);
          socket.close(1000, "장치 변경");
          return;
        }
        
        console.log(`WebSocket 연결 성공 - 장치: ${device}`);
        connectionManagerRef.current.state = ConnectionState.CONNECTED;
        connectionStatusRef.current = "서버 연결됨";
        setConnected(true);
        setError(null);
        
        // 연결 후 ping 메시지 전송
        try {
          socket.send(JSON.stringify({ type: 'ping', device: device }));
        } catch (err) {
          console.error("Ping 메시지 전송 실패:", err);
        }
      };
      
      socket.onmessage = (event: MessageEvent) => {
        // 기본 검증
        if (!isMounted.current || !monitoringEnabled) return;
        
        // 데이터 타임아웃 취소
        clearConnectionTimer('dataTimeout');
        
        try {
          const response = JSON.parse(event.data);
          
          // 핑/퐁 메시지 처리
          if (response.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          
          if (response.type === 'pong') {
            console.log("Pong 메시지 수신 - 서버 연결 양호");
            return;
          }
          
          // 오류 메시지 처리
          if (response.type === 'error') {
            console.error("서버 오류:", response.message);
            setError(response.message || '서버에서 오류가 발생했습니다.');
            return;
          }
          
          // 디스크 메트릭 처리
          if (response.type === 'disk_metrics') {
            // 현재 연결된 장치가 실제 요청한 장치와 같은지 확인
            if (device.trim() !== currentDeviceRef.current.trim()) {
              console.log(`장치 불일치로 데이터 무시: 수신=${device}, 현재=${currentDeviceRef.current}`);
              return;
            }
            
            // 데이터 수신 성공 표시
            setDataReceived(true);
            
            // 로딩 상태 확인 후 업데이트
            if (loading) {
              console.log(`데이터 수신 완료, 로딩 상태 종료: ${device}`);
              setLoading(false);
            }
            
            // 디스크 정보 처리
            let diskInfo = null;
            
            // 데이터 구조 분석 (간소화)
            if (response.data) {
              const serverData = response.data;
              
              if (serverData.primary_disk) {
                diskInfo = serverData.primary_disk;
              } else if (serverData.disks && serverData.disks.length > 0) {
                diskInfo = serverData.disks[0];
              } else if (serverData.device) {
                diskInfo = serverData;
              }
            } else if (response.disks && response.disks.length > 0) {
              diskInfo = response.disks[0];
            } else if (response.device) {
              diskInfo = response;
            }
            
            // 디스크 정보가 없는 경우 기본값 사용
            if (!diskInfo) {
              console.warn(`디스크 정보가 없습니다. 기본 데이터 사용.`);
              diskInfo = {
                device: device,
                model: "기본 디스크 모델",
                usage_percent: 50,
                total: 100,
                free: 50,
                used: 50,
                read_speed: Math.random() * 50,
                write_speed: Math.random() * 30,
                active_time: Math.random() * 100,
                response_time: Math.random() * 10,
                is_system_disk: true,
                has_page_file: false,
                filesystem_type: "ext4",
                interface_type: "SSD"
              };
            }

            // 데이터 매핑 및 업데이트
            const deviceName = diskInfo.device || "Unknown";
            let shortDeviceName = deviceName.split('/').pop() || deviceName;
            shortDeviceName = shortDeviceName.replace(/--/g, '-');

            const newDiskData = {
              device: shortDeviceName,
              model: diskInfo.model || "Unknown",
              usage_percent: diskInfo.usage_percent || 0,
              total: diskInfo.total || 0,
              free: diskInfo.free || 0,
              used: diskInfo.used || 0,
              read_speed: diskInfo.read_speed || 0,
              write_speed: diskInfo.write_speed || 0,
              active_time: diskInfo.active_time || 0,
              response_time: diskInfo.response_time || 0,
              is_system_disk: diskInfo.is_system_disk || false,
              has_page_file: diskInfo.has_page_file || false,
              filesystem_type: diskInfo.filesystem_type || "Unknown",
              interface_type: diskInfo.interface_type || "Unknown"
            };
            
            // 상태 업데이트
            setDiskData(newDiskData);
            
            // 활동 히스토리 업데이트
            setActivityHistory(prev => {
              const time = timeCounterRef.current++;
              const newPoint = { time, activity: newDiskData.active_time };
              const newHistory = [...prev, newPoint];
              return newHistory.length > maxPoints ? newHistory.slice(-maxPoints) : newHistory;
            });
            
            // 속도 히스토리 업데이트
            setSpeedHistory(prev => {
              const time = timeCounterRef.current;
              const newPoint = { 
                time, 
                read: newDiskData.read_speed, 
                write: newDiskData.write_speed 
              };
              const newHistory = [...prev, newPoint];
              
              // 최대 속도 자동 조정
              const currentMaxSpeed = Math.max(
                ...newHistory.map(p => Math.max(p.read, p.write)),
                50 // 최소 50MB/s
              );
              
              if (currentMaxSpeed > maxSpeed * 0.8) {
                setMaxSpeed(Math.ceil(currentMaxSpeed / 50) * 50);
              }
              
              return newHistory.length > maxPoints ? newHistory.slice(-maxPoints) : newHistory;
            });
          }
        } catch (err) {
          console.error('데이터 파싱 실패:', err);
          if (isMounted.current) setError('데이터 파싱 오류');
        }
      };
      
      // 오류 및 닫힘 이벤트는 재연결을 위한 공통 처리 사용
      socket.onerror = () => {
        if (!isMounted.current) return;
        
        console.error(`WebSocket 오류 발생`);
        connectionStatusRef.current = "연결 오류";
        connectionManagerRef.current.state = ConnectionState.ERROR;
        
        // 데이터를 받지 못했을 때만 오류 표시
        if (!dataReceived) {
          setError('서버 연결 오류가 발생했습니다.');
          setLoading(false);
        }
        
        // 재연결 처리
        handleReconnect();
      };
      
      socket.onclose = (event: CloseEvent) => {
        if (!isMounted.current) return;
        
        console.log(`WebSocket 종료 - 코드: ${event.code}`);
        setConnected(false);
        
        // 정리 중이면 종료 처리하지 않음
        if (connectionManagerRef.current.state === ConnectionState.CLEANING) {
          return;
        }
        
        // 연결 상태 업데이트
        connectionManagerRef.current.state = ConnectionState.DISCONNECTED;
        
        // 코드에 따른 오류 메시지
        if (event.code === 1008) {
          setError('인증에 실패했습니다.');
          connectionStatusRef.current = "인증 실패";
        } else if (event.code === 1006 || !event.wasClean) {
          if (!dataReceived) {
            setError('비정상적으로 연결이 종료되었습니다.');
          }
          connectionStatusRef.current = "연결 종료";
        } else {
          connectionStatusRef.current = "연결 종료됨";
        }
        
        // 이미 데이터를 받은 경우 오류 메시지 제거
        if (dataReceived) {
          setError(null);
        }
        
        // 재연결 처리
        handleReconnect();
      };
    } catch (error) {
      if (!isMounted.current) return;
      
      console.error(`WebSocket 생성 오류:`, error);
      setError('WebSocket 연결을 생성할 수 없습니다.');
      setLoading(false);
      
      // 연결 상태 업데이트
      connectionManagerRef.current.state = ConnectionState.ERROR;
      
      // 재연결 처리
      handleReconnect();
    }
  }, [device, nodeId, monitoringEnabled, loading, dataReceived, clearConnectionTimer, setConnectionTimer]);

  // 재연결 처리 함수
  const handleReconnect = useCallback(() => {
    if (!isMounted.current || !monitoringEnabled) return;
    
    // 장치 변경 중이면 재연결 건너뜀
    if (connectionManagerRef.current.deviceChanging) {
      console.log("장치 변경 중이므로 재연결 건너뜀");
      return;
    }
    
    // 재연결 시도 증가
    connectionManagerRef.current.reconnectAttempts++;
    const attempts = connectionManagerRef.current.reconnectAttempts;
    
    // 최대 재시도 횟수 초과 검사
    if (attempts > MAX_RECONNECT_ATTEMPTS) {
      console.log(`최대 재연결 시도 횟수(${MAX_RECONNECT_ATTEMPTS})를 초과했습니다.`);
      connectionStatusRef.current = "재연결 실패";
      connectionManagerRef.current.state = ConnectionState.ERROR;
      return;
    }
    
    // 재연결 상태로 변경
    connectionManagerRef.current.state = ConnectionState.RECONNECTING;
    connectionStatusRef.current = `${attempts}/${MAX_RECONNECT_ATTEMPTS} 재연결 중...`;
    console.log(`재연결 시도 ${attempts}/${MAX_RECONNECT_ATTEMPTS}`);
    
    // 일정 시간 후 재연결 시도
    setConnectionTimer('reconnect', () => {
      if (isMounted.current && monitoringEnabled) {
        createConnection();
      }
    }, RECONNECT_DELAY);
  }, [monitoringEnabled, setConnectionTimer, createConnection]);

  // ===== 이벤트 처리 함수 =====
  
  // 오류 발생 시 재시도 버튼 핸들러
  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    clearAllData();
    connectionManagerRef.current.reconnectAttempts = 0;
    
    // 연결 상태에 따라 처리
    if (connectionManagerRef.current.state === ConnectionState.CLEANING) {
      // 정리 중이면 대기
      connectionManagerRef.current.pendingDevice = device;
    } else {
      // 정리 후 새 연결 시도 (Promise 사용)
      cleanupConnection().then(() => {
        if (isMounted.current) {
          createConnection();
        }
      });
    }
  }, [clearAllData, device, cleanupConnection, createConnection]);

  // ===== 생명주기 효과 =====
  
  // 컴포넌트 마운트/언마운트
  useEffect(() => {
    isMounted.current = true;
    console.log("컴포넌트 마운트", device);
    
    return () => {
      console.log("컴포넌트 언마운트", device);
      isMounted.current = false;
      cleanupConnection();
    };
  }, [cleanupConnection, device]);

  // 디바이스 변경 처리
  useEffect(() => {
    // 최초 마운트 시에는 초기화 작업만 수행
    if (initialMountRef.current) {
      console.log(`최초 마운트 초기화: ${device}`);
      initialMountRef.current = false;
      currentDeviceRef.current = device;
      
      // 기본 검증
      if (!monitoringEnabled) {
        setLoading(false);
        return;
      }
      
      if (!nodeId || !isAuthenticated) {
        setError(!nodeId ? "유효한 노드 ID가 필요합니다." : "인증이 필요합니다.");
        setLoading(false);
        return;
      }
      
      // 최초 연결 시작 - 약간 지연 추가
      console.log(`최초 장치 연결: ${device}`);
      setConnectionTimer('initialConnect', createConnection, 500);
      return;
    }
    
    // 디바운스를 위한 기존 타이머 정리
    if (deviceChangeTimerRef.current !== null) {
      clearTimeout(deviceChangeTimerRef.current);
      deviceChangeTimerRef.current = null;
    }
    
    // 실제 장치 변경 검사 - 문자열 비교 강화
    const isDeviceChanged = currentDeviceRef.current.trim() !== device.trim();
    
    // 디버그 로그 추가
    console.log(`장치 변경 확인: 현재=${currentDeviceRef.current}, 새로운=${device}, 변경됨=${isDeviceChanged}`);
    
    // 실제 변경이 있을 때만 처리
    if (isDeviceChanged) {
      console.log(`실제 장치 변경 감지: ${currentDeviceRef.current} -> ${device}`);
      
      // 즉시 상태 업데이트 (UI 반응성)
      setLoading(true);
      setError(null);
      
      // 장치 변경 중 상태 설정
      connectionManagerRef.current.deviceChanging = true;
      
      // 데이터 초기화
      clearAllData();
      setConnected(false);
      
      // 현재 장치 참조 업데이트
      currentDeviceRef.current = device;
      
      // 기본 검증
      if (!monitoringEnabled) {
        setLoading(false);
        connectionManagerRef.current.deviceChanging = false;
        return;
      }
      
      if (!nodeId || !isAuthenticated) {
        setError(!nodeId ? "유효한 노드 ID가 필요합니다." : "인증이 필요합니다.");
        setLoading(false);
        connectionManagerRef.current.deviceChanging = false;
        return;
      }
      
      // 디바운스 처리 - 지연 시간 증가
      deviceChangeTimerRef.current = window.setTimeout(() => {
        deviceChangeTimerRef.current = null;
        
        // 새 연결 전에 기존 연결 정리 (Promise 사용)
        cleanupConnection().then(() => {
          // 장치 변경 중 상태 해제
          connectionManagerRef.current.deviceChanging = false;
          
          // 정리 완료 후에만 새 연결 시작
          console.log(`장치 변경 후 새 연결 시작: ${device}`);
          if (isMounted.current) {
            createConnection();
          }
        });
      }, 500); // 지연 시간 증가
    } else {
      console.log(`장치 변경 없음, 무시: ${device}`);
    }
  }, [nodeId, device, monitoringEnabled, isAuthenticated, clearAllData, 
      setConnectionTimer, cleanupConnection, createConnection]);

  // location 변경 정리 - 필요한 경우에만 수행하도록 수정
  useEffect(() => {
    // React Router의 location.key가 변경될 때만 정리 수행
    // 단, 같은 디스크 내에서의 변경은 무시
    const handleRouteChange = () => {
      // 디스크 모니터 내에서의 변경은 제외 (같은 컴포넌트 내 라우팅)
      if (location.pathname.includes('/performance') && !location.pathname.includes('/performance/')) {
        return;
      }
      
      // 이미 연결이 있는 경우에만 정리 수행
      if (socketRef.current) {
        console.log("중요 라우트 변경으로 정리 수행");
        cleanupConnection();
      }
    };
    
    // 컴포넌트 마운트 시 이벤트 리스너 등록
    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      // 컴포넌트 언마운트 시 이벤트 리스너 제거 및 정리
      window.removeEventListener('popstate', handleRouteChange);
      
      // 실제 언마운트 시에만 정리 작업 수행
      if (isMounted.current) {
        console.log("라우트 변경으로 정리 수행");
        clearAllTimers();
        if (socketRef.current) {
          cleanupConnection();
        }
      }
    };
  }, [location.key, cleanupConnection, clearAllTimers]);

  // ===== 렌더링 =====
  return (
    <div className={styles.diskMonitorContainer}>
      {!monitoringEnabled ? (
        <div className={styles.disconnectedState}>
          <div>모니터링이 비활성화되었습니다</div>
          <div>데이터 수집을 시작하려면 모니터링을 활성화하세요</div>
        </div>
      ) : loading && !error ? (
        <div className={styles.loadingState}>
          <div>데이터 로딩 중... ({device.split('/').pop()})</div>
          <div className={styles.loadingSpinner}></div>
          <div className={styles.connectionStatus}>
            {connected ? "서버에 연결됨, 데이터 대기 중..." : "서버에 연결 중..."}
          </div>
        </div>
      ) : error ? (
        <div className={styles.errorState}>
          <div>{error}</div>
          <button 
            className={styles.retryButton}
            onClick={handleRetry}
          >
            다시 시도
          </button>
        </div>
      ) : !connected ? (
        <div className={styles.disconnectedState}>서버에 연결 중...</div>
      ) : (
        <>
          {/* 연결 상태 표시 */}
          {connected && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 'bold',
              backgroundColor: 'rgba(0, 128, 0, 0.8)',
              color: 'white',
              zIndex: 10
            }}>
              {connectionStatusRef.current}
            </div>
          )}
          
          {/* 헤더 영역 */}
          <div className={styles.headerSection}>
            <div className={styles.diskTitle}>
              디스크 ({diskData.device})
            </div>
            <div className={styles.diskModel}>
              {diskData.model}
            </div>
          </div>
          
          {/* 차트 영역 - 기존 코드와 동일 */}
          <div className={styles.chartSection}>
            {/* 첫 번째 그래프: 디스크 활동률 */}
            <div className={styles.chartContainer}>
              <div className={styles.chartHeader}>
                <div className={styles.chartLabel}>60초</div>
                <div className={styles.chartMaxValue}>100%</div>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart
                  data={activityHistory}
                  margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7FBA00" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#7FBA00" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="time" hide={true} />
                  <YAxis domain={[0, 100]} hide={true} />
                  <Tooltip 
                    formatter={(value) => [`${value}%`, '활동률']}
                    contentStyle={{ backgroundColor: '#333', border: 'none', borderRadius: '4px' }}
                    labelFormatter={() => ''}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="activity" 
                    stroke="#7FBA00" 
                    fill="url(#colorActivity)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className={styles.chartFooter}>
                <div>디스크 활동 속도</div>
                <div>0</div>
              </div>
            </div>
            
            {/* 두 번째 그래프: 디스크 읽기/쓰기 속도 */}
            <div className={styles.chartContainer}>
              <div className={styles.chartHeader}>
                <div className={styles.chartLabel}>60초</div>
                <div className={styles.chartMaxValue}>{maxSpeed}MB/s</div>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart
                  data={speedHistory}
                  margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="colorRead" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3498db" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3498db" stopOpacity={0.2}/>
                    </linearGradient>
                    <linearGradient id="colorWrite" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e74c3c" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#e74c3c" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="time" hide={true} />
                  <YAxis domain={[0, maxSpeed]} hide={true} />
                  <Tooltip 
                    formatter={(value) => [`${typeof value === 'number' ? value.toFixed(1) : value} MB/s`, '']}
                    contentStyle={{ backgroundColor: '#333', border: 'none', borderRadius: '4px' }}
                    labelFormatter={() => ''}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="read" 
                    name="읽기 속도"
                    stroke="#3498db" 
                    fill="url(#colorRead)" 
                    isAnimationActive={false}
                    strokeWidth={1}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="write" 
                    name="쓰기 속도"
                    stroke="#e74c3c" 
                    fill="url(#colorWrite)" 
                    isAnimationActive={false}
                    strokeWidth={1}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className={styles.chartFooter}>
                <div>디스크 전송 속도</div>
                <div>0</div>
              </div>
            </div>
          </div>
          
          {/* 메트릭 정보 영역 - 기존 코드와 동일 */}
          <div className={styles.metricsSection}>
            <div className={styles.metricRow}>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>활성 시간</div>
                <div className={styles.metricValue}>{diskData.active_time}%</div>
              </div>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>평균 응답 시간</div>
                <div className={styles.metricValue}>{diskData.response_time}ms</div>
              </div>
            </div>
            
            <div className={styles.metricRow}>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>읽기 속도</div>
                <div className={styles.metricValue}>{diskData.read_speed}MB/s</div>
              </div>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>쓰기 속도</div>
                <div className={styles.metricValue}>{diskData.write_speed}MB/s</div>
              </div>
            </div>
            
            <div className={styles.metricRow}>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>용량</div>
                <div className={styles.metricValue}>{diskData.total}GB</div>
              </div>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>포맷</div>
                <div className={styles.metricValue}>{diskData.filesystem_type}</div>
              </div>
            </div>
            
            <div className={styles.metricRow}>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>시스템 디스크</div>
                <div className={styles.metricValue}>{diskData.is_system_disk ? '예' : '아니오'}</div>
              </div>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>페이지 파일</div>
                <div className={styles.metricValue}>{diskData.has_page_file ? '예' : '아니오'}</div>
              </div>
            </div>
            
            <div className={styles.metricRow}>
              <div className={styles.metricGroup}>
                <div className={styles.metricLabel}>종류</div>
                <div className={styles.metricValue}>{diskData.interface_type}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// React.memo로 컴포넌트를 감싸서 불필요한 리렌더링 방지
export default React.memo(DiskMonitor, (prevProps, nextProps) => {
  // device prop이 실질적으로 같다면 리렌더링하지 않음
  return prevProps.device.trim() === nextProps.device.trim();
});