'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string | null;
  onDone: () => void;
  duration?: number;
}

export default function Toast({ message, onDone, duration = 2500 }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); setTimeout(onDone, 300); }, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDone]);

  if (!message) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white bg-indigo-600 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {message}
    </div>
  );
}
