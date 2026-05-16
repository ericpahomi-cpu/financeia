'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        setMessage('Compte créé ! Vérifiez votre email pour confirmer votre inscription.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Une erreur est survenue.';
      setError(msg);
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
          <p className="text-[#6b7280] text-sm mt-1">Votre conseiller financier IA personnel</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
          <h2 className="text-[#1a1a1a] font-semibold text-lg mb-5">
            {mode === 'login' ? 'Se connecter' : 'Créer un compte'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-[#6b7280] text-xs block mb-1">Prénom et nom</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jean Dupont"
                  required={mode === 'signup'}
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className="text-[#6b7280] text-xs block mb-1">Adresse email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="text-[#6b7280] text-xs block mb-1">Mot de passe</label>
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
              {isLoading
                ? 'Chargement...'
                : mode === 'login'
                ? 'Se connecter'
                : 'Créer mon compte'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-[#f3f4f6] text-center">
            {mode === 'login' ? (
              <p className="text-[#6b7280] text-sm">
                Pas encore de compte ?{' '}
                <button
                  onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
                  className="text-indigo-600 font-medium hover:text-indigo-500"
                >
                  Créer un compte
                </button>
              </p>
            ) : (
              <p className="text-[#6b7280] text-sm">
                Déjà un compte ?{' '}
                <button
                  onClick={() => { setMode('login'); setError(''); setMessage(''); }}
                  className="text-indigo-600 font-medium hover:text-indigo-500"
                >
                  Se connecter
                </button>
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-[#9ca3af] text-xs mt-6">
          FinanceAI — Informations à des fins éducatives uniquement.
        </p>
      </div>
    </div>
  );
}
