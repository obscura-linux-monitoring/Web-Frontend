import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import api from '../api';
import { getToken } from '../utils/Auth';

type SshConnectionData = {
    host: string;
    port: string;
    user: string;
    password: string;
    google_id: string;
    node_id: string;
    key: string;
}

interface SshContextType {
    sshConnection: SshConnectionData | null;
    hasSshConnection: boolean;
    setSshConnection: (sshConnection: SshConnectionData) => void;
    getSshConnection: (google_id: string, node_id: string) => Promise<void>;
    saveSshConnection: (connectionData: SshConnectionData) => Promise<void>;
    loading: boolean;
}

const defaultSshConnection: SshConnectionData = {
    host: '',
    port: '22',
    user: '',
    password: '',
    google_id: '',
    node_id: '',
    key: ''
};

const SshContext = createContext<SshContextType | undefined>(undefined);

export const SshProvider = ({ children }: { children: ReactNode }) => {
    const [sshConnection, setSshConnection] = useState<SshConnectionData | null>(null);
    const [hasSshConnection, setHasSshConnection] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);

    const getNodeExternalIp = async (node_id: string): Promise<string | null> => {
        if (!node_id) return null;

        try {
            const response = await api.get('http://1.209.148.143:8000/ssh/get_node_external_ip', {
                params: { node_id }
            });

            if (response.data.status === 'success') {
                console.log('노드 external_ip 조회 성공:', response.data.external_ip);
                return response.data.external_ip;
            } else {
                console.error('노드 external_ip 조회 실패:', response.data.message);
                return null;
            }
        } catch (err) {
            console.error('❌ 노드 external_ip 조회 실패:', err);
            return null;
        }
    };

    const getSshConnection = async (google_id: string, node_id: string): Promise<void> => {
        if (!google_id || !node_id) return;

        setLoading(true);
        try {
            const response = await api.get('http://1.209.148.143:8000/ssh/get_ssh_connection', {
                params: { google_id, node_id }
            });

            const data = response.data.result;
            console.log('SSH 연결 데이터:', data);

            if (data) {
                setHasSshConnection(true);
                setSshConnection({
                    host: data.host,
                    port: data.port,
                    user: data.user,
                    password: data.password,
                    key: data.key,
                    google_id,
                    node_id
                });
            } else {
                // SSH 연결 정보가 없는 경우 노드의 external_ip를 호스트로 설정
                const externalIp = await getNodeExternalIp(node_id);
                
                setHasSshConnection(false);
                setSshConnection({
                    ...defaultSshConnection,
                    host: externalIp || '', // external_ip가 있으면 호스트로 설정
                    google_id,
                    node_id
                });
            }
        } catch (err) {
            console.error('❌ SSH 연결 데이터 로딩 실패:', err);
            setHasSshConnection(false);
            
            // 오류가 발생해도 노드의 external_ip를 시도
            const externalIp = await getNodeExternalIp(node_id);
            setSshConnection({
                ...defaultSshConnection,
                host: externalIp || '',
                google_id,
                node_id
            });
        } finally {
            setLoading(false);
        }
    };

    const saveSshConnection = async (connectionData: SshConnectionData): Promise<void> => {
        setLoading(true);
        try {
            const response = await api.post('http://1.209.148.143:8000/ssh/create_ssh_connection', {
                google_id: connectionData.google_id,
                node_id: connectionData.node_id,
                host: connectionData.host,
                user: connectionData.user,
                password: connectionData.password,
                port: connectionData.port
            });

            if (response.data.status === 'success') {
                setHasSshConnection(true);
                setSshConnection(connectionData);
            } else {
                throw new Error(response.data.message || 'SSH 연결 설정 실패');
            }
        } catch (err: any) {
            console.error('❌ SSH 연결 데이터 저장 실패:', err);
            setHasSshConnection(false);
            
            let errorMessage = 'SSH 연결에 실패했습니다.';
            const detail = err.response?.data?.detail || err.message || '';
            
            if (detail.includes('CONNECTION_REFUSED')) {
                errorMessage = '서버에 연결할 수 없습니다. 호스트 주소와 포트번호를 확인해주세요.';
            } else if (detail.includes('CONNECTION_TIMEOUT')) {
                errorMessage = '연결 시간이 초과되었습니다. 호스트 주소와 포트번호를 확인해주세요.';
            } else if (detail.includes('INVALID_USER')) {
                errorMessage = '존재하지 않는 사용자입니다. 사용자명을 확인해주세요.';
            } else if (detail.includes('AUTH_FAILED')) {
                errorMessage = '사용자명 또는 비밀번호가 올바르지 않습니다. 확인해주세요.';
            } else if (detail.includes('INVALID_PASSWORD')) {
                errorMessage = '비밀번호가 올바르지 않습니다. 비밀번호를 확인해주세요.';
            } else if (detail.includes('호스트 키 가져오기 시간 초과')) {
                errorMessage = '서버 응답 시간이 초과되었습니다. 호스트 주소와 포트번호를 확인해주세요.';
            }
            
            const customError = new Error(errorMessage);
            throw customError;
        } finally {
            setLoading(false);
        }
    };

    return (
        <SshContext.Provider value={{
            sshConnection,
            hasSshConnection,
            setSshConnection,
            getSshConnection,
            saveSshConnection,
            loading
        }}>
            {children}
        </SshContext.Provider>
    );
};

export const useSshContext = () => {
    const context = useContext(SshContext);
    if (context === undefined) {
        throw new Error('useSshContext must be used within a SshProvider');
    }
    return context;
};