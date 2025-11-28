import React from 'react';
import { ChevronLeft } from 'lucide-react';

interface MenuCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  colorClass: string; // e.g. "bg-red-500"
  onClick: () => void;
  tags?: string[];
}

export const MenuCard: React.FC<MenuCardProps> = ({ 
  title, 
  description, 
  icon, 
  colorClass, 
  onClick, 
  tags = [] 
}) => {
  // Extract text color class from bg class (heuristic: bg-red-500 -> text-red-400)
  const textClass = colorClass.replace('bg-', 'text-').replace('500', '400');

  return (
    <div 
      onClick={onClick}
      className={`relative group p-4 rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-800/80 transition-all cursor-pointer overflow-hidden`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass}`} />
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg bg-gray-950 border border-gray-800 ${textClass}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold text-white group-hover:text-gray-200 transition-colors">{title}</h3>
          </div>
          <p className="text-sm text-gray-400 mb-3 leading-relaxed">
            {description}
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, i) => (
              <span key={i} className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-gray-950 border border-gray-800 text-gray-500">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="self-center text-gray-600 group-hover:text-white transition-colors">
          <ChevronLeft className="rotate-180" size={20} />
        </div>
      </div>
    </div>
  );
};