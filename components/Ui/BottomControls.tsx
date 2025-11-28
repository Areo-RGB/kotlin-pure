import React from 'react';

interface BottomControlsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const BottomControls: React.FC<BottomControlsProps> = ({ children, className = '', ...props }) => {
  return (
    <div className={`bg-gray-900 z-30 border-t border-gray-800 pb-[env(safe-area-inset-bottom)] ${className}`} {...props}>
      {children}
    </div>
  );
};

export const ControlRow: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => {
  return (
    <div className={`p-4 flex items-center justify-center gap-6 ${className}`} {...props}>
      {children}
    </div>
  );
};
