import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`bg-gray-900/80 backdrop-blur-md border border-gray-800 rounded-xl p-4 shadow-xl ${onClick ? 'cursor-pointer hover:border-gray-600 transition-colors' : ''} ${className}`}
    >
      {children}
    </div>
  );
};