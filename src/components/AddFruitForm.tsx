import React, { useState } from "react";

// Props 타입 정의
interface AddFruitFormProps {
  addFruit: (fruitName: string) => void; // addFruit 함수의 타입 정의
}

const AddFruitForm: React.FC<AddFruitFormProps> = ({ addFruit }) => {
  const [fruit, setFruit] = useState<string>(""); // 상태에 string 타입 추가

  const handleAddFruit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    addFruit(fruit); // 부모 컴포넌트로 과일 이름 전달
    setFruit(""); // 입력 필드 초기화
  };

  return (
    <form onSubmit={handleAddFruit}>
      <input
        type="text"
        placeholder="Add a fruit"
        value={fruit}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFruit(e.target.value)} // 이벤트 타입 추가
      />
      <button type="submit">Add</button>
    </form>
  );
};

export default AddFruitForm;