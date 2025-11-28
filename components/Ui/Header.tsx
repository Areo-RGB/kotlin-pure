import React from 'react';
import { Button } from './Button';
import { ChevronLeft } from 'lucide-react';

interface HeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  variant?: 'default' | 'overlay';
  className?: string;
  titleColor?: string;
}

export const Header: React.FC<HeaderProps> = ({ 
  title, 
  subtitle, 
  icon, 
  onBack, 
  rightElement, 
  variant = 'default',
  className = '',
  titleColor = 'text-white'
}) => {
  const isOverlay = variant === 'overlay';
  
  return (
    <div className={`
      flex items-center justify-between p-4 pt-[calc(1rem+env(safe-area-inset-top))] z-50
      ${isOverlay ? 'absolute top-0 left-0 right-0 pointer-events-none bg-gradient-to-b from-black/80 to-transparent' : 'relative bg-gray-950 border-b border-gray-800'}
      ${className}
    `}>
      <div className={`flex items-center gap-4 ${isOverlay ? 'pointer-events-auto' : ''}`}>
        {onBack && (
          <Button variant="icon" onClick={onBack} className={isOverlay ? "bg-black/50 backdrop-blur-md border-gray-700" : ""}>
            <ChevronLeft size={20} />
          </Button>
        )}
        {(title || icon) && (
          <div className={isOverlay ? "bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-gray-700 flex items-center gap-2" : "flex items-center gap-2"}>
             {icon && <div className={isOverlay ? titleColor : "text-gray-400"}>{icon}</div>}
             <div className={!isOverlay ? "" : ""}>
               <h1 className={`font-bold ${isOverlay ? `text-sm uppercase tracking-wider ${titleColor}` : `text-xl ${titleColor}`}`}>
                 {title}
               </h1>
               {subtitle && !isOverlay && (
                 <p className="text-xs text-gray-400 font-normal">{subtitle}</p>
               )}
             </div>
          </div>
        )}
      </div>

      <div className={`${isOverlay ? 'pointer-events-auto' : ''} flex items-center gap-2`}>
        {rightElement}
      </div>
    </div>
  );
};