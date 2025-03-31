import React, { useEffect, useState } from 'react';
import api from '../api';
import AddFruitForm from './AddFruitForm';

// Fruit 타입 정의
interface Fruit {
  id: number;
  name: string;
}

const FruitList: React.FC = () => {
  const [fruits, setFruits] = useState<Fruit[]>([]); // 상태에 Fruit 배열 타입 추가

  const fetchFruits = async (): Promise<void> => {
    try {
      const response = await api.get<{ fruits: Fruit[] }>('/fruits'); // API 응답 타입 정의
      setFruits(response.data.fruits);
    } catch (error) {
      console.error("Error fetching fruits", error);
    }
  };

  const addFruit = async (fruitName: string): Promise<void> => { // 매개변수와 반환값 타입 추가
    try {
      await api.post('/fruits', { name: fruitName });
      fetchFruits(); // 과일 목록 새로고침
    } catch (error) {
      console.error("Error adding fruit", error);
    }
  };

  useEffect(() => {
    console.log("Fruits:", fruits);
  }, [fruits]);

  return (
    <div>
      <h2>Fruits List</h2>
      <ul>
        {fruits.map((fruit) => (
          <li key={fruit.id}>{fruit.name}</li> // id를 key로 사용
        ))}
      </ul>
      <AddFruitForm addFruit={addFruit} />
    </div>
  );
};

export default FruitList;