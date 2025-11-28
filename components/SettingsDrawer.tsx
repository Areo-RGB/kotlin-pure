import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings } from 'lucide-react';
import { Button } from './Button';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ 
  isOpen, 
  onClose, 
  title = "Settings", 
  children 
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
         <motion.div 
           initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
           animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
           exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
           className="absolute inset-0 z-40 bg-gray-950/80 flex items-center justify-center p-4"
           onClick={onClose}
         >
            <div 
              className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-6 flex flex-col max-h-[80vh]" 
              onClick={(e) => e.stopPropagation()}
            >
                <div className="text-center shrink-0">
                    <h2 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                        <Settings size={20} /> {title}
                    </h2>
                </div>

                <div className="space-y-6 overflow-y-auto pr-1 custom-scrollbar flex-1">
                  {children}
                </div>

                <div className="shrink-0">
                  <Button fullWidth onClick={onClose}>
                      Close
                  </Button>
                </div>
            </div>
         </motion.div>
      )}
    </AnimatePresence>
  );
};