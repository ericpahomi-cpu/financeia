'use client';

import { useState, useEffect, useRef } from 'react';

interface Article {
  title: string; description: string; url: string;
  source: string; publishedAt: string; image?: string;
}

const CATEGORIES = [
  { key: 'all',       label: 'Tout' },
  { key: 'politique', label: 'Politique' },
  { key: 'economie',  label: 'Économie' },
  { key: 'marches',   label: 'Marchés' },
  { key: 'banques',   label: 'Banques centrales' },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `il y a ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

export default function ActualitesPage() {
  const [articles, setArticles]   = useState<Article[]>([]);
  const [category, setCategory]   = useState<CategoryKey>('all');
  const [loading, setLoading]     = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const load = async (cat: CategoryKey) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/news?category=${cat}`);
      const data = await res.json() as { articles: Article[] };
      setArticles(data.articles || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(category);
    intervalRef.current = setInterval(() => load(category), 15 * 60 * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [category]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">📰 Actualités</h1>
          <p className="text-[#6b7280] text-sm">Finance US et Canada — mise à jour toutes les 15 min</p>
        </div>
        <button onClick={() => load(category)}
          className="px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600 text-sm hover:bg-indigo-100 transition-colors">
          🔄
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((c) => (
          <button key={c.key} onClick={() => setCategory(c.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              category === c.key ? 'bg-indigo-600 text-white' : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-indigo-300'
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#e5e7eb] rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-[#f3f4f6] rounded w-3/4 mb-2" />
              <div className="h-3 bg-[#f3f4f6] rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
              className="block bg-white border border-[#e5e7eb] rounded-xl p-4 hover:shadow-md hover:border-indigo-200 transition-all">
              <div className="flex gap-3">
                {a.image && (
                  <img src={a.image} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 hidden sm:block" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1a1a1a] text-sm line-clamp-2 mb-1">{a.title}</p>
                  {a.description && (
                    <p className="text-[#6b7280] text-xs line-clamp-2 mb-2">{a.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
                    <span className="font-medium text-indigo-600">{a.source}</span>
                    <span>•</span>
                    <span>{timeAgo(a.publishedAt)}</span>
                  </div>
                </div>
              </div>
            </a>
          ))}
          {articles.length === 0 && (
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-10 text-center">
              <p className="text-[#9ca3af]">Aucun article disponible pour le moment.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
