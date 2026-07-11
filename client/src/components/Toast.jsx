import { useEffect } from 'react';

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div className="fixed top-4 right-4 z-50 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white shadow-xl animate-fade-in">
      {message}
    </div>
  );
}
