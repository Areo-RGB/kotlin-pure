import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'icon' | 'scoreSync';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  className = '',
  ...props 
}) => {
  const baseStyles = "font-medium rounded-lg transition-all duration-200 active:scale-95 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900";
  
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white focus:ring-indigo-500 shadow-lg shadow-indigo-500/20",
    secondary: "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 focus:ring-gray-500",
    danger: "bg-red-900/50 hover:bg-red-900/70 text-red-100 border border-red-900 focus:ring-red-500",
    success: "bg-emerald-600 hover:bg-emerald-500 text-white focus:ring-emerald-500",
    icon: "p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full aspect-square",
    scoreSync: "bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white shadow-lg shadow-indigo-500/20 border-none"
  };

  const widthClass = fullWidth ? "w-full py-3" : "px-4 py-2";

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${widthClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};