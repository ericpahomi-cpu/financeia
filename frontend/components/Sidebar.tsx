'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/dashboard',             icon: '📊', label: 'Dashboard' },
  { href: '/dashboard/marches',     icon: '🌍', label: 'Marchés' },
  { href: '/dashboard/crypto',      icon: '₿',  label: 'Crypto' },
  { href: '/dashboard/surveiller',  icon: '👁️', label: 'À surveiller' },
  { href: '/dashboard/actualites',  icon: '📰', label: 'Actualités' },
  { href: '/dashboard/reports',     icon: '📄', label: 'Rapports' },
  { href: '/dashboard/chat',        icon: '💬', label: 'Chat IA' },
  { href: '/dashboard/settings',    icon: '⚙️', label: 'Paramètres' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [userName, setUserName]   = useState('');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserName((user.user_metadata?.full_name as string) || user.email?.split('@')[0] || '');
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
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-[#e5e7eb] min-h-screen p-3">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-5 px-2 pt-1">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0">
            FA
          </div>
          <div>
            <h1 className="text-[#1a1a1a] font-bold text-base leading-none">FinanceAI</h1>
            <p className="text-indigo-500 text-xs">Conseiller IA</p>
          </div>
        </div>

        {/* User badge */}
        {userName && (
          <div className="mx-1 mb-4 px-2.5 py-2 bg-[#f8f9fa] border border-[#e5e7eb] rounded-lg">
            <p className="text-[#1a1a1a] text-xs font-semibold truncate">{userName}</p>
            <p className="text-[#9ca3af] text-xs truncate">{userEmail}</p>
          </div>
        )}

        <nav className="flex-1 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a1a]'
                }`}>
                <span className="text-base w-5 text-center">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#e5e7eb] pt-3 mt-3 space-y-0.5">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[#6b7280] hover:bg-red-50 hover:text-red-600 transition-colors text-sm font-medium">
            <span className="text-base w-5 text-center">🚪</span>
            <span>Déconnexion</span>
          </button>
          <p className="text-[#d1d5db] text-xs px-2.5 pb-1">Powered by Claude AI</p>
        </div>
      </aside>

      {/* ── Mobile bottom nav ───────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e5e7eb] z-50">
        <div className="flex items-center justify-around py-1.5">
          {navItems.slice(0, 5).map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg ${isActive ? 'text-indigo-600' : 'text-[#9ca3af]'}`}>
                <span className="text-xl">{item.icon}</span>
                <span className="text-[10px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
