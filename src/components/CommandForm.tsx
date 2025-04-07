import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from '../scss/Command.module.scss';
import api from '../api';

interface CommandFormProps {
  onSubmitSuccess?: () => void;
  nodeId?: string;
}

const CommandForm: React.FC<CommandFormProps> = ({ onSubmitSuccess, nodeId }) => {
  const [formData, setFormData] = useState({
    target: '',
    command_type: 'a',
    command_status: '1',
    node_id: nodeId || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nodeId) {
      setFormData(prev => ({
        ...prev,
        node_id: nodeId
      }));
    }
  }, [nodeId]);

  const commandTypeOptions = ['a', 'b', 'c', 'd', 'e'];
  const commandStatusOptions = ['1', '2', '3', '4'];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // API 엔드포인트는 실제 백엔드에 맞게 조정해야 합니다
      await api.post('/protected/command/insert', formData);
      
      // 폼 초기화
      setFormData({
        target: '',
        command_type: 'a',
        command_status: '1',
        node_id: nodeId || ''
      });
      
      // 제출 성공 후 콜백 호출
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (err) {
      setError('명령 등록에 실패했습니다. 다시 시도해주세요.');
      console.error('명령 등록 오류:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>명령 등록</h2>
      {error && <div className={styles.errorMessage}>{error}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="target">대상 PID</label>
          <input
            className={styles.input}
            type="text"
            id="target"
            name="target"
            value={formData.target}
            onChange={handleChange}
            required
            placeholder="PID 값 입력"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="node_id">노드 ID</label>
          <input
            className={styles.input}
            type="text"
            id="node_id"
            name="node_id"
            value={formData.node_id}
            onChange={handleChange}
            required
            placeholder="노드 ID 입력"
            readOnly={!!nodeId}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="command_type">명령 유형</label>
          <select
            className={styles.select}
            id="command_type"
            name="command_type"
            value={formData.command_type}
            onChange={handleChange}
            required
          >
            {commandTypeOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="command_status">명령 상태</label>
          <select
            className={styles.select}
            id="command_status"
            name="command_status"
            value={formData.command_status}
            onChange={handleChange}
            required
          >
            {commandStatusOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <button 
          className={styles.button} 
          type="submit" 
          disabled={isSubmitting}
        >
          {isSubmitting ? '처리 중...' : '명령 등록'}
        </button>
      </form>
    </div>
  );
};

export default CommandForm;