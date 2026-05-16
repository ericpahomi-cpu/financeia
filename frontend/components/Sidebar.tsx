'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/dashboard/reports', icon: '📄', label: 'Rapports' },
  { href: '/dashboard/chat', icon: '💬', label: 'Chat IA' },
  { href: '/dashboard/settings', icon: '⚙️', label: 'Paramètres' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const name = (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || '';
        setUserName(name);
        setUserEmail(user.email || '');
      }
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-[#e5e7eb] min-h-screen p-4">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            FA
          </div>
          <div>
            <h1 className="text-[#1a1a1a] font-bold text-lg leading-none">FinanceAI</h1>
            <p className="text-indigo-500 text-xs">Conseiller IA</p>
          </div>
        </div>

        {/* User info */}
        {userName && (
          <div className="mx-2 mb-5 px-3 py-2.5 bg-[#f8f9fa] border border-[#e5e7eb] rounded-lg">
            <p className="text-[#1a1a1a] text-sm font-medium truncate">{userName}</p>
            <p className="text-[#9ca3af] text-xs truncate">{userEmail}</p>
          </div>
        )}

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a1a]'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#e5e7eb] pt-4 mt-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#6b7280] hover:bg-red-50 hover:text-red-600 transition-colors text-sm font-medium"
          >
            <span>🚪</span>
            <span>Déconnexion</span>
          </button>
          <div className="px-3 pt-2">
            <p className="text-[#d1d5db] text-xs">FinanceAI v1.0 — Powered by Claude AI</p>
          </div>
        </div>
      </aside>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e5e7eb] z-50">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg ${
                  isActive ? 'text-indigo-600' : 'text-[#9ca3af]'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-xs">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
