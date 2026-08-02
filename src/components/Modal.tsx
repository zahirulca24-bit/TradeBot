/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, AlertTriangle } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="relative w-full max-w-md overflow-hidden rounded-xl border border-trading-border bg-sidebar-bg shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-trading-border px-5 py-4">
              <div className="flex items-center gap-2 text-brand-bybit">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-semibold text-slate-100">{title}</h3>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-slate-400 hover:bg-card-bg hover:text-slate-200 transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 text-slate-300">
              {children}
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-trading-border bg-dark-bg/50 px-5 py-4">
              <button
                onClick={onClose}
                className="rounded-lg bg-dark-bg px-4 py-2 text-sm font-medium text-slate-200 hover:bg-card-bg hover:text-slate-100 transition-colors cursor-pointer border border-trading-border"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
