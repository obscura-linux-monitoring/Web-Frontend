/**
 * 바이트 단위의 숫자를 사람이 읽기 쉬운 형식으로 변환합니다.
 * @param bytes 변환할 바이트 수
 * @returns 변환된 문자열 (예: "1.5 MB")
 */
export const formatBytes = (bytes?: number): string => {
  if (!bytes) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  
  // 적절한 단위를 찾기 위한 로그 계산
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // 해당 단위로 변환하고 소수점 2자리까지 표시
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}; 