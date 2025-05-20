/**
 * Terminal 컴포넌트
 * 
 * 웹 기반 SSH 터미널을 구현한 컴포넌트입니다.
 * XTerm.js 라이브러리를 사용하여 브라우저에서 터미널 에뮬레이션을 제공하고,
 * WebSocket을 통해 백엔드 SSH 서버와 통신합니다.
 */
import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import '../../scss/node/Terminal.css';

// 인터페이스 정의
interface ConnectionForm {
    host: string;
    port: string;
    username: string;
    password: string;
    google_id: string;
}

interface ModalProps {
    children: React.ReactNode;
    onClose: () => void;
}

// 모달 컴포넌트 추가
function Modal({ children, onClose }: ModalProps) {
    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                {children}
                <button className="modal-close" onClick={onClose}>닫기</button>
            </div>
        </div>
    );
}

function Terminal() {
    // DOM 요소 참조를 위한 ref
    const terminalRef = useRef < HTMLDivElement > (null);
    // XTerm 터미널 인스턴스를 저장하는 상태
    const [term, setTerm] = useState < XTerminal | null > (null);
    // WebSocket 연결을 위한 ref
    const socketRef = useRef < WebSocket | null > (null);
    // SSH 연결 상태를 관리하는 상태
    const [isConnected, setIsConnected] = useState < boolean > (false);
    // SSH 연결 정보를 관리하는 상태
    const [connectionForm, setConnectionForm] = useState < ConnectionForm > ({
        host: '127.0.0.1',
        port: '3022',
        username: 'horizon',
        password: '',
        google_id: ''
    });
    // 호스트 키 대기 상태
    const [pendingHostKey, setPendingHostKey] = useState < string | null > (null);
    // 로딩 상태 관리
    const [isLoading, setIsLoading] = useState < boolean > (false);
    // 명령 실행 결과
    const [commandResult, setCommandResult] = useState < string > ('');
    // 명령 실행 성공/실패 상태
    const [commandStatus, setCommandStatus] = useState < 'success' | 'error' | null > (null);
    // 명령 모달 상태
    const [isCommandModalOpen, setIsCommandModalOpen] = useState < boolean > (false);
    // 명령어 입력 상태
    const [commandInput, setCommandInput] = useState < string > ('');

    // 폼 입력 처리
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setConnectionForm({
            ...connectionForm,
            [name]: value
        });
    };

    /**
     * SSH 연결 처리 함수
     * WebSocket을 통해 백엔드 SSH 서버에 연결을 시도합니다.
     */
    const handleConnect = () => {
        // 이미 연결되어 있으면 연결 종료
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.close();
        }

        // 터미널 초기화
        if (term) {
            term.clear();
            term.writeln('SSH 서버에 연결 중...');
        }

        // WebSocket 연결
        const socket = new WebSocket('ws://1.209.148.143:8000/ssh/ws/ssh');
        socketRef.current = socket;

        // WebSocket 이벤트 핸들러 등록
        socket.onopen = () => {
            console.log('WebSocket 연결됨');
            // 연결 정보 전송
            socket.send(JSON.stringify(connectionForm));
        };

        // 서버로부터 데이터 수신 시 터미널에 출력
        socket.onmessage = (event: MessageEvent) => {
            // 호스트 키 신뢰 요청 메시지 처리
            if (event.data.startsWith('HOSTKEY:')) {
                setPendingHostKey(event.data.replace('HOSTKEY:', '').trim());
                setIsConnected(false);
                return;
            }
            term?.write(event.data);
        };

        // 오류 발생 시 처리
        socket.onerror = (error: Event) => {
            console.error('WebSocket 오류:', error);
            term?.writeln('\r\n연결 오류가 발생했습니다.');
            setIsConnected(false);
        };

        // 연결 종료 시 처리
        socket.onclose = () => {
            console.log('WebSocket 연결 종료');
            term?.writeln('\r\n연결이 종료되었습니다.');
            setIsConnected(false);
        };

        setIsConnected(true);
    };

    /**
     * 터미널 인스턴스 초기화 
     * 컴포넌트 마운트 시 한 번만 실행됩니다.
     */
    useEffect(() => {
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
            if (terminal) {
                terminal.dispose();
            }
        };
    }, []);

    /**
     * 터미널 DOM 연결 및 이벤트 설정
     * term 상태가 설정된 후 실행됩니다.
     */
    useEffect(() => {
        if (!term || !terminalRef.current) return;

        // DOM에 터미널 렌더링
        term.open(terminalRef.current);

        // Fit Addon 추가 (터미널 크기 자동 조정)
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        fitAddon.fit();

        // 윈도우 크기 변경 시 터미널 크기 조정
        const handleResize = () => {
            fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        // 터미널 입력을 서버로 전송
        term.onData((data: string) => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(data);
            }
        });

        // 이벤트 리스너 정리 및 연결 종료
        return () => {
            window.removeEventListener('resize', handleResize);
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.close();
            }
        };
    }, [term]);

    // 호스트 키 신뢰 버튼 클릭 시
    const handleTrustHostKey = () => {
        if (socketRef.current && pendingHostKey) {
            socketRef.current.send(JSON.stringify({
                ...connectionForm,
                trust_hostkey: true
            }));
            setPendingHostKey(null);
            setIsConnected(true);
        }
    };

    // 모달 닫기 핸들러
    const handleCloseModal = () => {
        setPendingHostKey(null);
        setIsConnected(false);
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.close();
        }
    };

    // 명령 입력 모달 열기
    const openCommandModal = () => {
        setCommandInput(''); // 명령어 입력 초기화
        setIsCommandModalOpen(true);
    };

    // 명령 입력 상태 업데이트
    const handleCommandInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCommandInput(e.target.value);
    };

    // 명령 실행 핸들러
    const executeCommand = async () => {
        // 명령어가 비어있으면 실행하지 않음
        if (!commandInput.trim()) {
            alert('실행할 명령어를 입력해주세요.');
            return;
        }

        // 명령 모달 닫기
        setIsCommandModalOpen(false);

        // 1. 폼 유효성 검사
        const { host, port, username, password, google_id } = connectionForm;
        if (!host || !port || !username || !password) {
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
            await new Promise < void> ((resolve, reject) => {
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

            await new Promise < void> ((resolve, reject) => {
                socket.onmessage = (event: MessageEvent) => {
                    // 호스트 키 관련 메시지는 실패로 처리
                    if (event.data.startsWith('HOSTKEY:')) {
                        reject('호스트 키가 아직 신뢰되지 않았습니다. 먼저 일반 SSH 연결을 통해 호스트 키를 신뢰해주세요.');
                        return;
                    }

                    // 성공/실패 접두어 처리
                    if (event.data.startsWith('SUCCESS:')) {
                        result = event.data.substring(8); // 'SUCCESS:' 제거
                        setCommandStatus('success');
                        statusSet = true; // 상태 설정 플래그 업데이트
                    } else if (event.data.startsWith('ERROR:')) {
                        result = event.data.substring(6); // 'ERROR:' 제거
                        setCommandStatus('error');
                        statusSet = true; // 상태 설정 플래그 업데이트
                    } else {
                        // 접두어가 없는 경우 (이전 버전과의 호환성)
                        result += event.data;
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
        <div className="terminal-container">
            {/* 연결되지 않은 경우 연결 폼 표시 */}
            {!isConnected && (
                <div className="connection-form">
                    <div className="form-group">
                        <label>호스트</label>
                        <input
                            type="text"
                            name="host"
                            value={connectionForm.host}
                            onChange={handleInputChange}
                        />
                    </div>
                    <div className="form-group">
                        <label>포트</label>
                        <input
                            type="text"
                            name="port"
                            value={connectionForm.port}
                            onChange={handleInputChange}
                        />
                    </div>
                    <div className="form-group">
                        <label>사용자명</label>
                        <input
                            type="text"
                            name="username"
                            value={connectionForm.username}
                            onChange={handleInputChange}
                        />
                    </div>
                    <div className="form-group">
                        <label>비밀번호</label>
                        <input
                            type="password"
                            name="password"
                            value={connectionForm.password}
                            onChange={handleInputChange}
                        />
                    </div>
                    <div className="form-group">
                        <label>구글 id</label>
                        <input
                            type="text"
                            name="google_id"
                            // value="{connectionForm.google_id}"
                            onChange={handleInputChange}
                        />
                    </div>
                    <div>
                        <button onClick={handleConnect}>연결</button>
                        <button onClick={openCommandModal} disabled={isLoading}>명령</button>
                    </div>

                    {/* 명령 실행 결과 표시 */}
                    {commandStatus && (
                        <div className={`command-result ${commandStatus}`}>
                            <h3>명령 실행 결과</h3>
                            <pre>{commandResult}</pre>
                        </div>
                    )}
                </div>
            )}
            {/* 터미널이 렌더링될 컨테이너 */}
            <div ref={terminalRef} className="terminal" />
            {/* 호스트 키 신뢰 모달 */}
            {pendingHostKey && (
                <Modal onClose={handleCloseModal}>
                    <div>최초 접속하는 서버입니다.<br />아래 호스트 키를 신뢰하시겠습니까?</div>
                    <pre>{pendingHostKey}</pre>
                    <button onClick={handleTrustHostKey}>신뢰하고 계속</button>
                </Modal>
            )}
            {/* 명령 입력 모달 */}
            {isCommandModalOpen && (
                <Modal onClose={() => setIsCommandModalOpen(false)}>
                    <div className="command-modal">
                        <h3>명령어 입력</h3>
                        <input
                            type="text"
                            value={commandInput}
                            onChange={handleCommandInputChange}
                            placeholder="실행할 명령어를 입력하세요"
                            className="command-input"
                            autoFocus
                        />
                        <button onClick={executeCommand}>실행</button>
                    </div>
                </Modal>
            )}
            {/* 로딩 모달 */}
            {isLoading && (
                <Modal onClose={() => { }}>
                    <div className="loading-container">
                        <div className="loading-spinner"></div>
                        <p>명령 실행 중입니다...</p>
                    </div>
                </Modal>
            )}
        </div>
    );
}

export default Terminal;