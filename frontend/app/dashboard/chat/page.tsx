'use client';

import ChatInterface from '@/components/ChatInterface';
import { useLanguage } from '@/lib/language-context';

export default function ChatPage() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col h-screen md:h-[calc(100vh-0px)]">
      <div className="px-4 md:px-6 py-4 border-b border-[#e5e7eb] bg-white flex-shrink-0">
        <h1 className="text-xl font-bold text-[#1a1a1a]">💬 {t.chat_title}</h1>
        <p className="text-[#6b7280] text-sm">{t.chat_placeholder}</p>
      </div>
      <div className="flex-1 min-h-0">
        <ChatInterface />
      </div>
    </div>
  );
}
