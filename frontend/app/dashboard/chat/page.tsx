import ChatInterface from '@/components/ChatInterface';

export default function ChatPage() {
  return (
    <div className="flex flex-col h-screen md:h-[calc(100vh-0px)]">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-[#2a2a4a] flex-shrink-0">
        <h1 className="text-xl font-bold text-white">💬 Chat avec FinanceAI</h1>
        <p className="text-slate-400 text-sm">
          Posez vos questions financières en temps réel
        </p>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 min-h-0">
        <ChatInterface />
      </div>
    </div>
  );
}
