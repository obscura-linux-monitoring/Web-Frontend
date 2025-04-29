import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import styles from '../../scss/node/NodeTerminal.module.scss';
import { useParams } from 'react-router-dom';
import { useNodeContext } from '../../context/NodeContext';

const NodeTerminal: React.FC = () => {
  const { nodeId } = useParams<{ nodeId: string }>();
  const { selectedNode } = useNodeContext();
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 유효한 노드 ID
  const currentNodeId = nodeId || selectedNode?.node_id;

  useEffect(() => {
    if (!currentNodeId) {
      setError("유효한 노드 ID가 필요합니다");
      return;
    }

    // 이전에 생성된 터미널이 있다면 초기화
    if (terminalInstance.current) {
      terminalInstance.current.dispose();
    }

    // xterm 터미널 설정
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Menlo", "DejaVu Sans Mono", "Consolas", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#f0f0f0',
        cursor: '#ffffff',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
        black: '#000000',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#d0d0d0',
        brightBlack: '#808080',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#e5c07b',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff'
      },
      allowTransparency: true,
      scrollback: 5000
    });

    // FitAddon 설정 (터미널 크기 자동 조정)
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // 터미널 DOM에 마운트
    if (terminalRef.current) {
      terminal.open(terminalRef.current);
      fitAddon.fit();
      terminalInstance.current = terminal;
      fitAddonRef.current = fitAddon;
    }

    // 웹소켓 연결
    const connectWebSocket = () => {
      // 기존 연결이 있다면 종료
      if (socketRef.current) {
        socketRef.current.close();
      }

      terminal.clear();
      terminal.writeln('🔄 노드에 연결 중입니다. 잠시만 기다려주세요...');

      // 웹소켓 연결 설정
      const socket = new WebSocket(`ws://1.209.148.143:8000/node/terminal/${currentNodeId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('📡 WebSocket 연결됨 - 터미널');
        setConnected(true);
        setError(null);
        terminal.clear();
        terminal.writeln('🟢 노드에 연결되었습니다. 명령어를 입력해주세요.');
        terminal.writeln('');
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'output') {
            terminal.write(data.content);
          } else if (data.type === 'error') {
            terminal.writeln(`\r\n\x1b[31m${data.content}\x1b[0m`);
          } else if (data.type === 'info') {
            terminal.writeln(`\r\n\x1b[36m${data.content}\x1b[0m`);
          }
        } catch (err) {
          // 일반 텍스트로 전송된 경우
          terminal.write(event.data);
        }
      };

      socket.onerror = (err) => {
        console.error('❌ WebSocket 에러:', err);
        setError('WebSocket 연결 실패');
        setConnected(false);
        terminal.writeln('\r\n\x1b[31m연결 오류가 발생했습니다. 다시 시도해주세요.\x1b[0m');
      };

      socket.onclose = (event) => {
        console.log('🔌 WebSocket 연결 종료 - 터미널');
        setConnected(false);
        
        if (event.wasClean) {
          terminal.writeln('\r\n\x1b[33m연결이 종료되었습니다.\x1b[0m');
        } else {
          terminal.writeln('\r\n\x1b[31m연결이 끊어졌습니다. 다시 연결하려면 페이지를 새로고침하세요.\x1b[0m');
        }
      };

      // 터미널 입력 처리
      terminal.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'input', content: data }));
        }
      });
    };

    connectWebSocket();

    // 창 크기 변경 시 터미널 크기 조정
    const handleResize = () => {
      fitAddon.fit();
      
      // 터미널 크기 변경 정보를 서버에 전송
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const { cols, rows } = terminal;
        socketRef.current.send(JSON.stringify({
          type: 'resize',
          cols,
          rows
        }));
      }
    };

    window.addEventListener('resize', handleResize);
    
    // 초기 크기 설정
    setTimeout(handleResize, 100);

    // 컴포넌트 언마운트 시 정리
    return () => {
      window.removeEventListener('resize', handleResize);
      if (socketRef.current) {
        socketRef.current.close();
      }
      terminal.dispose();
    };
  }, [currentNodeId]);

  return (
    <div className={styles.terminalPageContainer}>
      <div className={styles.terminalHeader}>
        <div className={styles.terminalControls}>
          <span className={`${styles.terminalButton} ${styles.close}`}></span>
          <span className={`${styles.terminalButton} ${styles.minimize}`}></span>
          <span className={`${styles.terminalButton} ${styles.maximize}`}></span>
        </div>
        <div className={styles.terminalTitle}>
          {selectedNode ? `${selectedNode.server_type} (${currentNodeId})` : '터미널'} 
          {connected ? <span className={styles.connectedBadge}>연결됨</span> : <span className={styles.disconnectedBadge}>연결 끊김</span>}
        </div>
      </div>
      
      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}
      
      <div className={styles.terminalContainer} ref={terminalRef} />
    </div>
  );
};

export default NodeTerminal;