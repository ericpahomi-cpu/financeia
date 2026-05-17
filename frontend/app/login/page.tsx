'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/language-context';

type Mode = 'login' | 'signup' | 'forgot';

export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();
  const { t }    = useLanguage();

  const [mode, setMode]         = useState<Mode>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const reset = () => { setError(''); setMessage(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        setMessage('Compte créé ! Vérifiez votre email pour confirmer votre inscription.');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'https://financeia-weld.vercel.app/auth/callback',
        });
        if (error) throw error;
        setMessage(t.forgot_sent);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    'w-full border border-[#e5e7eb] rounded-lg px-3 py-2.5 text-[#1a1a1a] text-sm focus:outline-none focus:border-indigo-400 transition-colors bg-white';

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 rounded-xl mb-3">
            <span className="text-white font-bold text-xl">FA</span>
          </div>
          <h1 className="text-[#1a1a1a] text-2xl font-bold">FinanceAI</h1>
          <p className="text-[#6b7280] text-sm mt-1">{t.subtitle}</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
          <h2 className="text-[#1a1a1a] font-semibold text-lg mb-5">
            {mode === 'login'  ? t.login_title  :
             mode === 'signup' ? t.signup_title :
             t.forgot_password}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full name — signup only */}
            {mode === 'signup' && (
              <div>
                <label className="text-[#6b7280] text-xs block mb-1">{t.login_fullname}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jean Dupont"
                  required
                  className={inputClass}
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="text-[#6b7280] text-xs block mb-1">{t.login_email}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                className={inputClass}
              />
            </div>

            {/* Password — login / signup only */}
            {mode !== 'forgot' && (
              <div>
                <label className="text-[#6b7280] text-xs block mb-1">{t.login_password}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className={inputClass}
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-700 text-sm">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-semibold text-sm transition-colors"
            >
              {isLoading ? t.loading_btn :
               mode === 'login'  ? t.login_submit  :
               mode === 'signup' ? t.signup_submit :
               t.forgot_send}
            </button>
          </form>

          {/* Forgot password link — login mode only */}
          {mode === 'login' && (
            <div className="mt-3 text-center">
              <button
                onClick={() => { setMode('forgot'); reset(); }}
                className="text-[#9ca3af] text-xs hover:text-indigo-600 transition-colors"
              >
                {t.forgot_password}
              </button>
            </div>
          )}

          <div className="mt-5 pt-5 border-t border-[#f3f4f6] text-center">
            {mode === 'forgot' ? (
              <button
                onClick={() => { setMode('login'); reset(); }}
                className="text-indigo-600 font-medium text-sm hover:text-indigo-500"
              >
                ← {t.forgot_back}
              </button>
            ) : mode === 'login' ? (
              <p className="text-[#6b7280] text-sm">
                {t.login_no_account}{' '}
                <button
                  onClick={() => { setMode('signup'); reset(); }}
                  className="text-indigo-600 font-medium hover:text-indigo-500"
                >
                  {t.login_create}
                </button>
              </p>
            ) : (
              <p className="text-[#6b7280] text-sm">
                {t.login_has_account}{' '}
                <button
                  onClick={() => { setMode('login'); reset(); }}
                  className="text-indigo-600 font-medium hover:text-indigo-500"
                >
                  {t.login_connect}
                </button>
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-[#9ca3af] text-xs mt-6">{t.disclaimer}</p>
      </div>
    </div>
  );
}
