/**
 * Terminal 컴포넌트
 * 
 * 웹 기반 SSH 터미널을 구현한 컴포넌트입니다.
 * XTerm.js 라이브러리를 사용하여 브라우저에서 터미널 에뮬레이션을 제공하고,
 * WebSocket을 통해 백엔드 SSH 서버와 통신합니다.
 */
import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import styles from '../../scss/node/NodeTerminal.module.scss';
import '../../scss/node/node_mobile/NodeTerminal.module.mobile.scss';
import FileExplorer from './FileExplorer';
import api from '../../api';
import { getToken } from '../../utils/Auth';
import { useParams } from 'react-router';
import { useSshContext } from '../../context/SshContext';

// 인터페이스 정의
interface ModalProps {
    children: React.ReactNode;
    onClose: () => void;
}

interface ConnectionForm {
    host: string;
    port: string;
    user: string;
    password: string;
    google_id: string;
    node_id: string;
    key: string;
}

type CommandStatus = 'success' | 'error' | null;

// 모달 컴포넌트 추가
function Modal({ children, onClose }: ModalProps): React.ReactElement {
    return (
        <div className={styles.modalBackdrop}>
            <div className={styles.modalContent}>
                {children}
                <button className={styles.modalClose} onClick={onClose}>닫기</button>
            </div>
        </div>
    );
}

function Terminal(): React.ReactElement {
    // DOM 요소 참조를 위한 ref
    const terminalRef = useRef<HTMLDivElement>(null);
    // XTerm 터미널 인스턴스를 저장하는 상태
    const [term, setTerm] = useState<XTerminal | null>(null);
    // WebSocket 연결을 위한 ref
    const socketRef = useRef<WebSocket | null>(null);
    // SSH 연결 상태를 관리하는 상태
    const [isConnected, setIsConnected] = useState<boolean>(false);

    // SSH Context 사용
    const {
        sshConnection,
        hasSshConnection,
        getSshConnection,
        saveSshConnection
    } = useSshContext();

    // 호스트 키 대기 상태
    const [pendingHostKey, setPendingHostKey] = useState<string | null>(null);
    // 로딩 상태 관리
    const [isLoading, setIsLoading] = useState<boolean>(false);
    // 명령 실행 결과
    const [commandResult, setCommandResult] = useState<string>('');
    // 명령 실행 성공/실패 상태
    const [commandStatus, setCommandStatus] = useState<CommandStatus>(null);
    // 명령 모달 상태
    const [isCommandModalOpen, setIsCommandModalOpen] = useState<boolean>(false);
    // 명령어 입력 상태
    const [commandInput, setCommandInput] = useState<string>('');
    // 화면 분할 상태 관리
    const [showFileExplorer, setShowFileExplorer] = useState<boolean>(true);

    const { nodeId: paramNodeId } = useParams<{ nodeId: string }>();

    // connectionForm을 sshConnection에서 가져온 값으로 설정
    const [connectionForm, setConnectionForm] = useState<ConnectionForm>({
        host: sshConnection?.host || '',
        port: sshConnection?.port || '22',
        user: sshConnection?.user || '',
        password: sshConnection?.password || '',
        google_id: sshConnection?.google_id || '',
        node_id: sshConnection?.node_id || '',
        key: sshConnection?.key || ''
    });

    // 연결 상태 개선을 위한 추가 상태
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
    const [connectionMessage, setConnectionMessage] = useState<string>('');
    const [retryCount, setRetryCount] = useState<number>(0);
    const maxRetries = 3;

    // 터미널 표시 상태 추가
    const [showTerminal, setShowTerminal] = useState<boolean>(false);

    // sshConnection이 변경될 때 connectionForm 업데이트
    useEffect(() => {
        if (sshConnection) {
            setConnectionForm({
                host: sshConnection.host,
                port: sshConnection.port,
                user: sshConnection.user,
                password: sshConnection.password,
                google_id: sshConnection.google_id,
                node_id: sshConnection.node_id,
                key: sshConnection.key
            });
        }
    }, [sshConnection]);

    // 폼 입력 처리
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const { name, value } = e.target;
        if (name === 'host' && (value === '127.0.0.1' || value === 'localhost')) {
            alert('127.0.0.1 또는 localhost는 사용할 수 없습니다.');
            return;
        }
        setConnectionForm({
            ...connectionForm,
            [name]: value
        });
    };

    /**
     * 개선된 SSH 연결 처리 함수
     */
    const handleConnect = (): void => {
        // 연결 상태 초기화
        setConnectionStatus('connecting');
        setConnectionMessage('SSH 서버에 연결 중...');
        setRetryCount(0);

        // 이미 연결되어 있으면 연결 종료
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.close();
        }

        // 터미널 초기화
        if (term) {
            term.clear();
            term.writeln('SSH 서버에 연결 중...');
        }

        connectWebSocket();
    };

    /**
     * 연결 오류 처리 함수
     */
    const handleConnectionError = (errorMessage: string): void => {
        setConnectionStatus('error');
        setConnectionMessage(errorMessage);
        setIsConnected(false);
        setShowTerminal(false);
        
        // 추가적인 오류 메시지 변환 (WebSocket 연결 중 발생하는 오류용)
        let userFriendlyMessage = errorMessage;
        if (errorMessage.includes('CONNECTION_REFUSED')) {
            userFriendlyMessage = '서버에 연결할 수 없습니다. 호스트 주소와 포트번호를 확인해주세요.';
        } else if (errorMessage.includes('CONNECTION_TIMEOUT')) {
            userFriendlyMessage = '연결 시간이 초과되었습니다. 호스트 주소와 포트번호를 확인해주세요.';
        } else if (errorMessage.includes('INVALID_USER')) {
            userFriendlyMessage = '존재하지 않는 사용자입니다. 사용자명을 확인해주세요.';
        } else if (errorMessage.includes('AUTH_FAILED')) {
            userFriendlyMessage = '사용자명 또는 비밀번호가 올바르지 않습니다. 확인해주세요.';
        } else if (errorMessage.includes('INVALID_PASSWORD')) {
            userFriendlyMessage = '비밀번호가 올바르지 않습니다. 비밀번호를 확인해주세요.';
        } else if (errorMessage.includes('인증 실패') || errorMessage.includes('Permission denied')) {
            userFriendlyMessage = '사용자명 또는 비밀번호가 올바르지 않습니다.';
        } else if (errorMessage.includes('연결 거부') || errorMessage.includes('Connection refused')) {
            userFriendlyMessage = '서버에 연결할 수 없습니다. 호스트 주소와 포트번호를 확인해주세요.';
        } else if (errorMessage.includes('시간 초과') || errorMessage.includes('timeout')) {
            userFriendlyMessage = '연결 시간이 초과되었습니다. 네트워크 상태를 확인해주세요.';
        }
        
        setConnectionMessage(userFriendlyMessage);
    };

    /**
     * WebSocket 연결 처리 함수
     */
    const connectWebSocket = (): void => {
        // WebSocket 연결
        const socket = new WebSocket('ws://1.209.148.143:8000/ssh/ws/ssh');
        socketRef.current = socket;

        // 연결 타임아웃 설정 (10초)
        const connectionTimeout = setTimeout(() => {
            if (socket.readyState === WebSocket.CONNECTING) {
                socket.close();
                handleConnectionError('연결 시간이 초과되었습니다.');
            }
        }, 10000);

        // WebSocket 이벤트 핸들러 등록
        socket.onopen = (): void => {
            clearTimeout(connectionTimeout);
            setConnectionMessage('연결 정보 전송 중...');
            
            // 연결 정보 전송
            try {
                socket.send(JSON.stringify(connectionForm));
            } catch (error) {
                console.error('연결 정보 전송 실패:', error);
                handleConnectionError('연결 정보 전송에 실패했습니다.');
            }
        };

        // 서버로부터 데이터 수신 시 처리
        socket.onmessage = (event: MessageEvent): void => {
            const data = event.data as string;
            
            // 상태 메시지 처리
            if (data.startsWith('CONNECTING:')) {
                const message = data.replace('CONNECTING:', '');
                setConnectionStatus('connecting');
                setConnectionMessage(message);
                term?.writeln('\r\n' + message);
                return;
            }
            
            if (data.startsWith('CONNECTED:')) {
                const message = data.replace('CONNECTED:', '');
                setConnectionStatus('connected');
                setConnectionMessage('연결됨');
                setIsConnected(true);
                setShowTerminal(true);
                term?.writeln('\r\n' + message);
                return;
            }
            
            if (data.startsWith('READY:')) {
                const message = data.replace('READY:', '');
                setShowTerminal(true);
                setConnectionStatus('connected');
                setIsConnected(true);
                
                // 터미널 포커스 설정
                setTimeout(() => {
                    if (terminalRef.current) {
                        term?.focus();
                    }
                }, 100);
                
                term?.writeln('\r\n' + message);
                return;
            }
            
            // 오류 메시지 처리
            if (data.startsWith('ERROR:')) {
                const errorMsg = data.replace('ERROR:', '');
                handleConnectionError(errorMsg);
                term?.writeln('\r\n오류: ' + errorMsg);
                return;
            }
            
            // 호스트 키 신뢰 요청 메시지 처리
            if (data.startsWith('HOSTKEY:')) {
                setPendingHostKey(data.replace('HOSTKEY:', '').trim());
                setConnectionStatus('disconnected');
                setIsConnected(false);
                setShowTerminal(false);
                setConnectionMessage('호스트 키 확인 필요');
                return;
            }
            
            // 일반 터미널 데이터 출력
            term?.write(data);
        };

        // 오류 발생 시 처리
        socket.onerror = (error: Event): void => {
            clearTimeout(connectionTimeout);
            console.error('❌ WebSocket 오류:', error);
            handleConnectionError('WebSocket 연결 오류가 발생했습니다.');
        };

        // 연결 종료 시 처리
        socket.onclose = (event: CloseEvent): void => {
            clearTimeout(connectionTimeout);
            console.log('🔌 WebSocket 연결 종료, 코드:', event.code);
            
            // 연결 종료 시 터미널 숨기기
            setShowTerminal(false);
            
            if (connectionStatus === 'connected') {
                setConnectionMessage('연결이 종료되었습니다.');
                term?.writeln('\r\n연결이 종료되었습니다.');
            }
            
            setConnectionStatus('disconnected');
            setIsConnected(false);
            
            // 의도하지 않은 연결 종료인 경우 재연결 시도
            if (event.code !== 1000 && event.code !== 1001 && retryCount < maxRetries && connectionStatus === 'connected') {
                setTimeout(() => {
                    console.log(`재연결 시도 중... (${retryCount + 1}/${maxRetries})`);
                    setRetryCount(prev => prev + 1);
                    connectWebSocket();
                }, 2000);
            }
        };
    };

    // 연결 설정 저장 및 자동 연결 시도
    const handleSaveConnectionForm = async (): Promise<void> => {
        try {
            setConnectionStatus('connecting');
            setConnectionMessage('연결 정보 검증 중...');
            
            // 연결 정보 저장 (여기서 실제 SSH 연결 테스트도 수행됨)
            await saveSshConnection(connectionForm);
            
            // 저장 후 자동으로 연결 시도
            setTimeout(() => {
                handleConnect();
            }, 500);
            
        } catch (error: any) {
            console.error('연결 시도 실패:', error);
            setConnectionStatus('error');
            // SshContext에서 변환된 사용자 친화적 메시지 사용
            setConnectionMessage(error.message || '연결 시도에 실패했습니다.');
        }
    };

    /**
     * 터미널 인스턴스 초기화 
     * 컴포넌트 마운트 시 한 번만 실행됩니다.
     */
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
            getSshConnection(res.data.user.sub, paramNodeId || '');
        }).catch((err) => {
            console.error('❌ 데이터 로딩 실패:', err);
        });

        const terminal = new XTerminal({
            cursorBlink: true,
            theme: {
                background: '#1E1E1E',
                foreground: '#FFFFFF'
            },
            fontSize: 14
        });

        setTerm(terminal);

        // 컴포넌트 언마운트 시 터미널 정리
        return () => {
            if (terminal && terminal.element) {
                terminal.dispose();
            }
        };
    }, []);

    /**
     * 터미널 DOM 연결 및 이벤트 설정
     * showTerminal이 true이고 term이 설정된 후 실행됩니다.
     */
    useEffect(() => {
        // showTerminal이 false이면 연결하지 않음
        if (!showTerminal || !term || !terminalRef.current) {
            return;
        }

        // 이미 터미널이 연결되어 있으면 제거
        if (term.element) {
            term.dispose();
            
            // 새 터미널 인스턴스 생성
            const newTerminal = new XTerminal({
                cursorBlink: true,
                theme: {
                    background: '#1E1E1E',
                    foreground: '#FFFFFF'
                },
                fontSize: 14
            });
            setTerm(newTerminal);
            return;
        }

        // DOM에 터미널 렌더링
        term.open(terminalRef.current);

        // Fit Addon 추가 (터미널 크기 자동 조정)
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        // 초기 맞춤 시도
        setTimeout(() => {
            fitAddon.fit();
        }, 100);

        // 주기적 크기 조정
        const fitInterval = setInterval(() => {
            fitAddon.fit();
        }, 1000);

        // 3초 후 interval 정리
        setTimeout(() => {
            clearInterval(fitInterval);
        }, 3000);

        // 윈도우 크기 변경 시 터미널 크기 조정
        const handleResize = (): void => {
            fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        // 터미널 입력을 서버로 전송
        const dataHandler = (data: string) => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(data);
            }
        };
        term.onData(dataHandler);

        // 터미널 포커스
        term.focus();

        // 정리 함수
        return () => {
            clearInterval(fitInterval);
            window.removeEventListener('resize', handleResize);
        };
    }, [showTerminal, term]);

    // 개선된 호스트 키 신뢰 처리
    const handleTrustHostKey = (): void => {
        if (socketRef.current && pendingHostKey) {
            setConnectionMessage('호스트 키 신뢰 처리 중...');
            
            try {
                socketRef.current.send(JSON.stringify({
                    ...connectionForm,
                    trust_hostkey: true
                }));
                setPendingHostKey(null);
                setConnectionStatus('connecting');
            } catch (error) {
                console.error('호스트 키 신뢰 처리 실패:', error);
                handleConnectionError('호스트 키 신뢰 처리에 실패했습니다.');
            }
        }
    };

    // 모달 닫기 핸들러
    const handleCloseModal = (): void => {
        setPendingHostKey(null);
        setIsConnected(false);
        setShowTerminal(false); // 모달 닫을 때 터미널 숨기기
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.close();
        }
    };

    // 명령 입력 모달 열기
    const openCommandModal = (): void => {
        setCommandInput(''); // 명령어 입력 초기화
        setIsCommandModalOpen(true);
    };

    // 명령 입력 상태 업데이트
    const handleCommandInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        setCommandInput(e.target.value);
    };

    // 명령 실행 핸들러
    const executeCommand = async (): Promise<void> => {
        // 명령어가 비어있으면 실행하지 않음
        if (!commandInput.trim()) {
            alert('실행할 명령어를 입력해주세요.');
            return;
        }

        // 명령 모달 닫기
        setIsCommandModalOpen(false);

        // 1. 폼 유효성 검사
        const { host, port, user, password } = connectionForm;
        if (!host || !port || !user || !password) {
            alert('모든 필드를 입력해주세요.');
            return;
        }

        // 로딩 상태 시작
        setIsLoading(true);
        setCommandResult('');
        setCommandStatus(null);

        try {
            // 2. WebSocket 연결
            const socket = new WebSocket('ws://1.209.148.143:8000/ssh/ws/ssh');
            socketRef.current = socket;

            // WebSocket 연결 완료 대기를 위한 Promise
            await new Promise<void>((resolve, reject) => {
                socket.onopen = () => {
                    console.log('명령 실행을 위한 WebSocket 연결됨');
                    resolve();
                };
                socket.onerror = (error: Event) => {
                    console.error('WebSocket 오류:', error);
                    reject('WebSocket 연결 실패');
                };
            });

            // 3. 연결 정보 전송 (command_mode: true와 사용자 입력 명령어 추가)
            socket.send(JSON.stringify({
                ...connectionForm,
                command_mode: true,
                command: commandInput
            }));

            // 4. 결과 수신 대기
            let result = '';
            let statusSet = false; // 상태 설정 여부를 추적하는 플래그

            await new Promise<void>((resolve, reject) => {
                socket.onmessage = (event: MessageEvent) => {
                    const data = event.data as string;

                    // 호스트 키 관련 메시지는 실패로 처리
                    if (data.startsWith('HOSTKEY:')) {
                        reject('호스트 키가 아직 신뢰되지 않았습니다. 먼저 일반 SSH 연결을 통해 호스트 키를 신뢰해주세요.');
                        return;
                    }

                    // 성공/실패 접두어 처리
                    if (data.startsWith('SUCCESS:')) {
                        result = data.substring(8); // 'SUCCESS:' 제거
                        setCommandStatus('success');
                        statusSet = true; // 상태 설정 플래그 업데이트
                    } else if (data.startsWith('ERROR:')) {
                        result = data.substring(6); // 'ERROR:' 제거
                        setCommandStatus('error');
                        statusSet = true; // 상태 설정 플래그 업데이트
                    } else {
                        // 접두어가 없는 경우 (이전 버전과의 호환성)
                        result += data;
                    }
                };

                socket.onclose = () => {
                    resolve();
                };

                // 10초 후 타임아웃
                setTimeout(() => {
                    if (socket.readyState === WebSocket.OPEN) {
                        reject('명령 실행 시간이 초과되었습니다.');
                    }
                }, 10000);
            });

            // 5. 결과 저장
            setCommandResult(result);
            // 상태 값 대신 지역 변수 사용
            if (!statusSet) { // 접두어가 없었던 경우 기본값으로 성공 설정
                setCommandStatus('success');
            }
        } catch (error) {
            console.error('명령 실행 오류:', error);
            setCommandResult(typeof error === 'string' ? error : '명령 실행 중 오류가 발생했습니다.');
            setCommandStatus('error');
        } finally {
            // WebSocket 연결 정리
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.close();
            }
            // 로딩 상태 종료
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.terminalPageContainer}>
            <div className={styles.terminalHeader}>
                <div className={styles.terminalControls}>
                    <div className={`${styles.terminalButton} ${styles.close}`}></div>
                    <div className={`${styles.terminalButton} ${styles.minimize}`}></div>
                    <div className={`${styles.terminalButton} ${styles.maximize}`}></div>
                </div>
                <div className={styles.terminalTitle}>
                    Terminal
                    {connectionStatus === 'connected' && (
                        <span className={styles.connectedBadge}>연결됨</span>
                    )}
                    {connectionStatus === 'connecting' && (
                        <span className={styles.connectingBadge}>연결 중...</span>
                    )}
                    {connectionStatus === 'error' && (
                        <span className={styles.errorBadge}>오류</span>
                    )}
                    {connectionStatus === 'disconnected' && (
                        <span className={styles.disconnectedBadge}>연결 안됨</span>
                    )}
                </div>
            </div>

            <div className={styles.mainContent}>
                {/* 파일 탐색기 토글 버튼 */}
                <button
                    className={styles.toggleExplorer}
                    onClick={() => setShowFileExplorer(!showFileExplorer)}
                >
                    {showFileExplorer ? '파일 탐색기 숨기기' : '파일 탐색기 표시'}
                </button>

                <div className={styles.terminalWorkspace}>
                    {/* 파일 탐색기 */}
                    {showFileExplorer && (
                        <FileExplorer
                            connectionForm={connectionForm}
                            isConnected={isConnected}
                        />
                    )}

                    {/* 터미널 컨테이너 */}
                    <div className={styles.terminalContainer}>
                        {/* 연결되지 않은 경우 연결 폼 표시 */}
                        {!showTerminal && (
                            <div className={styles.connectionForm}>
                                <h2>SSH 연결 설정</h2>
                                
                                {/* 연결 상태 메시지 */}
                                <div className={`${styles.connectionStatus} ${styles[connectionStatus]}`}>
                                    {connectionMessage && (
                                        <p>{connectionMessage}</p>
                                    )}
                                    {connectionStatus === 'connecting' && (
                                        <div className={styles.loadingSpinner}></div>
                                    )}
                                </div>

                                <div className={styles.formGroup}>
                                    <label>호스트</label>
                                    <input
                                        type="text"
                                        name="host"
                                        value={connectionForm.host}
                                        onChange={handleInputChange}
                                        disabled={hasSshConnection}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>포트</label>
                                    <input
                                        type="text"
                                        name="port"
                                        value={connectionForm.port}
                                        onChange={handleInputChange}
                                        disabled={hasSshConnection}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>사용자명</label>
                                    <input
                                        type="text"
                                        name="user"
                                        value={connectionForm.user}
                                        onChange={handleInputChange}
                                        disabled={hasSshConnection}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>비밀번호</label>
                                    <input
                                        type="password"
                                        name="password"
                                        value={connectionForm.password}
                                        onChange={handleInputChange}
                                        disabled={hasSshConnection}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    {/* <label>구글 아이디</label> */}
                                    <input
                                        type="text"
                                        name="google_id"
                                        value={connectionForm.google_id}
                                        // onChange={handleInputChange}
                                        disabled={true}
                                        hidden={true}
                                    />
                                    <input
                                        type="text"
                                        name="node_id"
                                        value={connectionForm.node_id}
                                        // onChange={handleInputChange}
                                        disabled={true}
                                        hidden={true}
                                    />
                                </div>
                                <div className={styles.formButtons}>
                                    <button
                                        className={styles.connectButton}
                                        onClick={hasSshConnection ? handleConnect : handleSaveConnectionForm}
                                        disabled={connectionStatus === 'connecting'}
                                    >
                                        {connectionStatus === 'connecting' 
                                            ? '연결 중...' 
                                            : hasSshConnection 
                                                ? '연결' 
                                                : '연결 설정'}
                                    </button>
                                    
                                    {/* 재시도 버튼 (오류 시에만 표시) */}
                                    {connectionStatus === 'error' && retryCount < maxRetries && (
                                        <button
                                            className={styles.retryButton}
                                            onClick={handleConnect}
                                        >
                                            다시 시도 ({retryCount}/{maxRetries})
                                        </button>
                                    )}
                                </div>

                                {/* 명령 실행 결과 표시 */}
                                {commandStatus && (
                                    <div className={`${styles.commandResult} ${styles[commandStatus]}`}>
                                        <h3>명령 실행 결과</h3>
                                        <pre>{commandResult}</pre>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* 터미널이 렌더링될 컨테이너 */}
                        {showTerminal && (
                            <div 
                                ref={terminalRef} 
                                className={styles.terminal}
                                style={{
                                    width: '100%',
                                    height: '400px',
                                    minHeight: '400px'
                                }}
                            />
                        )}

                        {/* 호스트 키 신뢰 모달 */}
                        {pendingHostKey && (
                            <Modal onClose={handleCloseModal}>
                                <div className={styles.hostKeyModal}>
                                    <h3>호스트 키 확인</h3>
                                    <p>최초 접속하는 서버입니다.<br />아래 호스트 키를 신뢰하시겠습니까?</p>
                                    <pre className={styles.hostKeyDisplay}>{pendingHostKey}</pre>
                                    <button
                                        className={styles.trustButton}
                                        onClick={handleTrustHostKey}
                                    >
                                        신뢰하고 계속
                                    </button>
                                </div>
                            </Modal>
                        )}

                        {/* 명령 입력 모달 */}
                        {isCommandModalOpen && (
                            <Modal onClose={() => setIsCommandModalOpen(false)}>
                                <div className={styles.commandModal}>
                                    <h3>명령어 입력</h3>
                                    <input
                                        type="text"
                                        value={commandInput}
                                        onChange={handleCommandInputChange}
                                        placeholder="실행할 명령어를 입력하세요"
                                        className={styles.commandInput}
                                        autoFocus
                                    />
                                    <button
                                        className={styles.executeButton}
                                        onClick={executeCommand}
                                    >
                                        실행
                                    </button>
                                </div>
                            </Modal>
                        )}

                        {/* 로딩 모달 */}
                        {isLoading && (
                            <Modal onClose={() => { }}>
                                <div className={styles.loadingContainer}>
                                    <div className={styles.loadingSpinner}></div>
                                    <p>명령 실행 중입니다...</p>
                                </div>
                            </Modal>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Terminal;