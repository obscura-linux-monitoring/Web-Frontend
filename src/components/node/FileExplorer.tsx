import { useState, useEffect, useRef } from 'react';
import styles from '../../scss/node/FileExplorer.module.scss';

// 인터페이스 정의
interface FileExplorerProps {
    connectionForm: ConnectionForm;
    isConnected: boolean;
}

interface ConnectionForm {
    host: string;
    port: string;
    user: string;
    password: string;
    google_id: string;
}

interface FileItem {
    name: string;
    isDirectory: boolean;
    size?: number;
    modTime?: string;
    permissions?: string;
}

function FileExplorer({ connectionForm, isConnected }: FileExplorerProps): React.ReactElement {
    const [currentPath, setCurrentPath] = useState<string>('');
    const [files, setFiles] = useState<FileItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSftpConnected, setIsSftpConnected] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [pathInput, setPathInput] = useState<string>('');
    const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false);
    const [filteredSuggestions, setFilteredSuggestions] = useState<FileItem[]>([]);
    const [autocompleteSelected, setAutocompleteSelected] = useState<number>(0);
    const pathInputRef = useRef<HTMLInputElement>(null);

    const normalizePath = (path: string): string => {
        const parts: string[] = [];
        const segments = path.split('/');

        for (let segment of segments) {
            if (segment === '' || segment === '.') continue;
            if (segment === '..') {
                if (parts.length > 0) {
                    parts.pop();
                }
            } else {
                parts.push(segment);
            }
        }
        return '/' + parts.join('/');
    };

    // 홈 디렉토리 가져오기
    const fetchHomeDirectory = async (): Promise<void> => {
        if (!isConnected) return;

        setIsLoading(true);
        setErrorMessage('');

        try {
            const { host, port, user, password, google_id } = connectionForm;
            const response = await fetch(`http://1.209.148.143:8000/sftp/home?host=${host}&port=${port}&user=${user}&password=${password}&google_id=${google_id || 'default'}`);
            const data = await response.json();

            if (data.error) {
                console.error('홈 디렉토리 가져오기 오류:', data.error);
                setErrorMessage('SFTP 연결에 실패했습니다: ' + data.error);
                setIsSftpConnected(false);
                return;
            }

            // 홈 디렉토리 설정 및 파일 목록 가져오기
            setCurrentPath(data.home);
            setPathInput(data.home); // 경로 입력창도 업데이트
            setIsSftpConnected(true);
            fetchDirectory(data.home);
        } catch (error) {
            console.error('SFTP 홈 요청 오류:', error);
            setErrorMessage('SFTP 서버 연결에 실패했습니다');
            setIsSftpConnected(false);
        } finally {
            setIsLoading(false);
        }
    };

    // 디렉토리 목록 가져오기
    const fetchDirectory = async (path: string): Promise<void> => {
        if (!isConnected) return;

        setIsLoading(true);
        setErrorMessage('');

        try {
            const { host, port, user, password, google_id } = connectionForm;
            const response = await fetch(`http://1.209.148.143:8000/sftp/list?host=${host}&port=${port}&user=${user}&password=${password}&path=${path}&google_id=${google_id || 'default'}`);
            const data: FileItem[] | { error: string } = await response.json();

            if ('error' in data) {
                console.error('디렉토리 목록 가져오기 오류:', data.error);
                setErrorMessage('디렉토리 목록을 가져오는데 실패했습니다: ' + data.error);
                return;
            }

            setFiles(data);
            setIsSftpConnected(true);
        } catch (error) {
            console.error('SFTP 요청 오류:', error);
            setErrorMessage('SFTP 서버와 통신 중 오류가 발생했습니다');
            setIsSftpConnected(false);
        } finally {
            setIsLoading(false);
        }
    };

    // 경로 변경 처리
    const handlePathChange = async (newPath: string): Promise<void> => {
        newPath = normalizePath(newPath);
        if (newPath === currentPath) return;

        // 경로 유효성 검사를 위해 해당 경로의 목록을 조회해봄
        setIsLoading(true);
        try {
            const { host, port, user, password, google_id } = connectionForm;
            const response = await fetch(`http://1.209.148.143:8000/sftp/list?host=${host}&port=${port}&user=${user}&password=${password}&path=${newPath}&google_id=${google_id || 'default'}`);
            const data: FileItem[] | { error: string } = await response.json();

            if ('error' in data) {
                console.error('잘못된 경로:', data.error);
                setErrorMessage('잘못된 경로입니다: ' + data.error);
                setPathInput(currentPath); // 입력 필드를 원래 경로로 복원
                return;
            }

            // 경로가 유효하면 상태 업데이트
            setCurrentPath(newPath);
            setPathInput(newPath);
            setFiles(data);
        } catch (error) {
            console.error('SFTP 경로 변경 오류:', error);
            setErrorMessage('경로 변경 중 오류 발생');
            setPathInput(currentPath); // 입력 필드를 원래 경로로 복원
        } finally {
            setIsLoading(false);
        }
    };

    // 경로 입력 상태 관리
    const handlePathInputChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const inputValue = e.target.value;
        setPathInput(inputValue);

        // 입력이 비어있으면 자동완성 숨기기
        if (!inputValue.trim()) {
            setShowAutocomplete(false);
            return;
        }

        // 입력된 마지막 문자가 슬래시인지 확인
        const endsWithSlash = inputValue.endsWith('/');

        if (endsWithSlash) {
            // 슬래시로 끝나는 경우 해당 디렉토리의 모든 파일/폴더 표시
            const dirPath = inputValue.length > 1 ? inputValue.slice(0, -1) : '/';

            // 현재 경로와 같은지 확인
            if (dirPath === currentPath) {
                // 현재 경로의 모든 파일/폴더 표시
                setFilteredSuggestions(files);
                setShowAutocomplete(files.length > 0);
                setAutocompleteSelected(0);
            } else {
                // 다른 경로의 파일/폴더 목록 가져오기
                setIsLoading(true);
                try {
                    const { host, port, user, password, google_id } = connectionForm;
                    const response = await fetch(`http://1.209.148.143:8000/sftp/list?host=${host}&port=${port}&user=${user}&password=${password}&path=${dirPath}&google_id=${google_id || 'default'}`);
                    const data: FileItem[] | { error: string } = await response.json();

                    if (!('error' in data)) {
                        setFilteredSuggestions(data);
                        setShowAutocomplete(data.length > 0);
                        setAutocompleteSelected(0);
                    } else {
                        // 디렉토리가 유효하지 않으면 자동완성 표시 안 함
                        setShowAutocomplete(false);
                    }
                } catch (error) {
                    console.error('경로 자동완성 오류:', error);
                    setShowAutocomplete(false);
                } finally {
                    setIsLoading(false);
                }
            }
            return;
        }

        // 일반적인 경로 처리 (슬래시로 끝나지 않는 경우)
        // 경로 분석
        const parts = inputValue.split('/').filter(Boolean);
        const lastPart = parts.length > 0 ? parts[parts.length - 1] : '';

        // 마지막 '/'의 위치 찾기
        const lastSlashIndex = inputValue.lastIndexOf('/');

        // 부모 경로 계산
        let parentPath = '/';
        if (lastSlashIndex > 0) {
            parentPath = inputValue.substring(0, lastSlashIndex);
        } else if (lastSlashIndex === 0) {
            parentPath = '/';
        }

        // 부모 경로가 유효하고 마지막 부분이 있는 경우에만 자동완성 시도
        if (lastPart && parentPath) {
            // 부모 경로가 현재 경로와 다르면 해당 경로의 목록 가져오기
            let folderContents = files;

            if (parentPath !== currentPath) {
                setIsLoading(true);
                try {
                    const { host, port, user, password, google_id } = connectionForm;
                    const response = await fetch(`http://1.209.148.143:8000/sftp/list?host=${host}&port=${port}&user=${user}&password=${password}&path=${parentPath}&google_id=${google_id || 'default'}`);
                    const data: FileItem[] | { error: string } = await response.json();

                    if (!('error' in data)) {
                        folderContents = data;
                    } else {
                        // 부모 경로가 유효하지 않으면 자동완성 표시 안 함
                        setShowAutocomplete(false);
                        setIsLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('경로 자동완성 오류:', error);
                    setShowAutocomplete(false);
                    setIsLoading(false);
                    return;
                }
                setIsLoading(false);
            }

            // 필터링된 제안 생성
            const suggestions = folderContents.filter(file =>
                file.name.toLowerCase().startsWith(lastPart.toLowerCase())
            );

            setFilteredSuggestions(suggestions);
            setShowAutocomplete(suggestions.length > 0);
            setAutocompleteSelected(0);
        } else {
            setShowAutocomplete(false);
        }
    };

    // 경로 입력 제출 처리
    const handlePathInputSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
        e.preventDefault();
        handlePathChange(pathInput);
        setShowAutocomplete(false);
    };

    // 자동완성 항목 선택
    const handleSuggestionClick = (suggestion: FileItem): void => {
        // 입력이 슬래시로 끝나는 경우 바로 해당 항목 추가
        if (pathInput.endsWith('/')) {
            const newPath = suggestion.isDirectory
                ? `${pathInput}${suggestion.name}/`
                : `${pathInput}${suggestion.name}`;

            setPathInput(newPath);

            if (suggestion.isDirectory) {
                // 디렉토리인 경우 해당 경로로 이동
                const dirPath = newPath.endsWith('/') ? newPath.slice(0, -1) : newPath;
                handlePathChange(dirPath);
            }

            setShowAutocomplete(false);
            return;
        }

        // 일반적인 경로 처리
        const inputValue = pathInput;
        const lastSlashIndex = inputValue.lastIndexOf('/');

        let newPath;

        if (lastSlashIndex >= 0) {
            // 경로의 마지막 부분만 교체
            const basePath = inputValue.substring(0, lastSlashIndex + 1);
            newPath = suggestion.isDirectory
                ? `${basePath}${suggestion.name}/`
                : `${basePath}${suggestion.name}`;
        } else {
            // 슬래시가 없는 경우, 현재 경로의 파일을 선택한 것
            newPath = suggestion.isDirectory
                ? `${currentPath === '/' ? '/' : currentPath + '/'}${suggestion.name}/`
                : `${currentPath === '/' ? '/' : currentPath + '/'}${suggestion.name}`;
        }

        setPathInput(newPath);

        if (suggestion.isDirectory) {
            // 디렉토리인 경우 해당 경로로 이동
            const dirPath = newPath.endsWith('/') ? newPath.slice(0, -1) : newPath;
            handlePathChange(dirPath);
        }

        setShowAutocomplete(false);
    };

    // 키보드 네비게이션
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (!showAutocomplete) return;

        // 위 화살표 키
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAutocompleteSelected(prev =>
                prev === 0 ? filteredSuggestions.length - 1 : prev - 1
            );
        }
        // 아래 화살표 키
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAutocompleteSelected(prev =>
                prev === filteredSuggestions.length - 1 ? 0 : prev + 1
            );
        }
        // Enter 키
        else if (e.key === 'Enter' && filteredSuggestions.length > 0) {
            e.preventDefault();
            handleSuggestionClick(filteredSuggestions[autocompleteSelected]);
        }
        // ESC 키
        else if (e.key === 'Escape') {
            e.preventDefault();
            setShowAutocomplete(false);
        }
    };

    // 파일 클릭 처리
    const handleFileClick = (file: FileItem): void => {
        if (file.isDirectory) {
            const newPath = currentPath === '/'
                ? `/${file.name}`
                : `${currentPath}/${file.name}`;
            handlePathChange(newPath);
        } else {
            // 파일 다운로드
            downloadFile(file);
        }
    };

    // 파일 다운로드
    const downloadFile = (file: FileItem): void => {
        const { host, port, user, password, google_id } = connectionForm;
        const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;

        // 다운로드 URL 생성
        const downloadUrl = `http://1.209.148.143:8000/sftp/download?host=${host}&port=${port}&user=${user}&password=${password}&path=${encodeURIComponent(filePath)}&google_id=${google_id || 'default'}`;

        // 새 창에서 다운로드 링크 열기
        window.open(downloadUrl, '_blank');
    };

    // 상위 디렉토리로 이동
    const goToParentDirectory = (): void => {
        if (currentPath === '/' || !currentPath) return;

        const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
        handlePathChange(parentPath);
    };

    // 연결 상태 변경 시 홈 디렉토리 가져오기
    useEffect(() => {
        if (isConnected) {
            fetchHomeDirectory();
        } else {
            setFiles([]);
            setIsSftpConnected(false);
            setCurrentPath('');
            setPathInput('');
        }
    }, [isConnected]);

    // 현재 경로 변경시 자동완성 닫기
    useEffect(() => {
        setShowAutocomplete(false);
    }, [currentPath]);

    return (
        <div className={styles['file-explorer']}>
            <div className={styles['file-explorer-header']}>
                <button
                    className={styles.parentButton}
                    onClick={goToParentDirectory}
                    disabled={currentPath === '/' || !currentPath}
                >
                    ↑ 상위 폴더
                </button>

                <form onSubmit={handlePathInputSubmit} className={styles['path-input-form']}>
                    <input
                        type="text"
                        value={pathInput}
                        onChange={handlePathInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="경로 입력"
                        className={styles['path-input']}
                        ref={pathInputRef}
                        disabled={!isConnected || !isSftpConnected}
                    />
                    <button
                        type="submit"
                        className={styles['path-go-button']}
                        disabled={!isConnected || !isSftpConnected}
                    >
                        이동
                    </button>
                </form>
            </div>

            {/* 자동완성 제안 */}
            {showAutocomplete && (
                <ul className={styles['autocomplete-suggestions']}>
                    {filteredSuggestions.length > 20 && (
                        <div className={styles['suggestion-count']}>
                            총 {filteredSuggestions.length}개 항목
                        </div>
                    )}
                    {filteredSuggestions.map((suggestion, index) => (
                        <li
                            key={suggestion.name}
                            className={`${styles['suggestion-item']} ${index === autocompleteSelected ? styles.selected : ''}`}
                            onClick={() => handleSuggestionClick(suggestion)}
                        >
                            <span className={styles['suggestion-icon']}>
                                {suggestion.isDirectory ? '📁' : '📄'}
                            </span>
                            <span className={styles['suggestion-name']}>{suggestion.name}</span>
                        </li>
                    ))}
                </ul>
            )}

            {isLoading ? (
                <div className={styles.loading}>로딩 중...</div>
            ) : !isConnected ? (
                <div className={`${styles['sftp-status']} ${styles.error}`}>
                    SSH 연결이 필요합니다
                </div>
            ) : !isSftpConnected ? (
                <div className={`${styles['sftp-status']} ${styles.error}`}>
                    {errorMessage || 'SFTP 연결에 실패했습니다'}
                </div>
            ) : (
                <ul className={styles['file-list']}>
                    {files.length > 0 ? files.map((file) => (
                        <li
                            key={file.name}
                            className={`${styles['file-item']} ${file.isDirectory ? styles.directory : styles.file}`}
                            onClick={() => handleFileClick(file)}
                        >
                            <span className={styles['file-icon']}>
                                {file.isDirectory ? '📁' : '📄'}
                            </span>
                            <span className={styles['file-name']}>{file.name}</span>
                        </li>
                    )) : (
                        <li className={styles['empty-folder']}>빈 폴더</li>
                    )}
                </ul>
            )}
        </div>
    );
}

export default FileExplorer;