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
                setHasSshConnection(false);
                setSshConnection({
                    ...defaultSshConnection,
                    google_id,
                    node_id
                });
            }
        } catch (err) {
            console.error('❌ SSH 연결 데이터 로딩 실패:', err);
            setHasSshConnection(false);
        } finally {
            setLoading(false);
        }
    };

    const saveSshConnection = async (connectionData: SshConnectionData): Promise<void> => {
        setLoading(true);
        try {
            await api.post('http://1.209.148.143:8000/ssh/create_ssh_connection', {
                google_id: connectionData.google_id,
                node_id: connectionData.node_id,
                host: connectionData.host,
                user: connectionData.user,
                password: connectionData.password,
                port: connectionData.port
            });

            setHasSshConnection(true);
            setSshConnection(connectionData);
        } catch (err) {
            console.error('❌ SSH 연결 데이터 저장 실패:', err);
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