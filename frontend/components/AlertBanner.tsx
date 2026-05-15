'use client';

interface Alert {
  id: string;
  type: string;
  asset: string;
  message: string;
  triggered_at: string;
}

interface AlertBannerProps {
  alerts: Alert[];
}

export default function AlertBanner({ alerts }: AlertBannerProps) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.slice(0, 3).map((alert) => (
        <div
          key={alert.id}
          className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3"
        >
          <span className="text-amber-400 text-lg flex-shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-amber-200 text-sm font-medium">{alert.message}</p>
            <p className="text-amber-400/60 text-xs">
              {new Date(alert.triggered_at).toLocaleTimeString('fr-FR')}
            </p>
          </div>
          <span className="text-amber-400/60 text-xs font-mono flex-shrink-0">
            {alert.asset}
          </span>
        </div>
      ))}
    </div>
  );
}
