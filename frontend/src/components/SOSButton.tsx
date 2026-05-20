import { useRef, useState, useEffect, useCallback } from "react";
import { AlertTriangle, Phone, MapPin, CheckCircle, X } from "lucide-react";

export type SOSState = "idle" | "counting" | "sending" | "dispatched" | "arrived";

export interface DispatchInfo {
  officerName: string;
  vehicleId: number;
  etaMinutes: number;
  phone?: string;
}

interface SOSButtonProps {
  onTrigger: () => Promise<void>;
  dispatchInfo?: DispatchInfo | null;
  state: SOSState;
  onStateChange: (s: SOSState) => void;
  onCancel?: () => void;
}

const COUNTDOWN_S = 3;
const RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function SOSButton({
  onTrigger,
  dispatchInfo,
  state,
  onStateChange,
  onCancel,
}: SOSButtonProps) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_S);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef = useRef(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (state !== "counting") {
      clearInterval(intervalRef.current);
      setSecondsLeft(COUNTDOWN_S);
      firedRef.current = false;
    }
  }, [state]);

  const startCountdown = useCallback(() => {
    if (state !== "idle") return;
    onStateChange("counting");
    navigator.vibrate?.(30);
    startTimeRef.current = Date.now();
    firedRef.current = false;

    intervalRef.current = setInterval(async () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const remaining = COUNTDOWN_S - elapsed;
      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        clearInterval(intervalRef.current);
        setSecondsLeft(0);
        navigator.vibrate?.([120, 60, 120, 60, 120]);
        onStateChange("sending");
        await onTrigger();
      } else {
        setSecondsLeft(Math.max(0, remaining));
      }
    }, 50);
  }, [state, onStateChange, onTrigger]);

  const cancelCountdown = useCallback(() => {
    clearInterval(intervalRef.current);
    setSecondsLeft(COUNTDOWN_S);
    onStateChange("idle");
    navigator.vibrate?.(40);
  }, [onStateChange]);

  const progress = (COUNTDOWN_S - secondsLeft) / COUNTDOWN_S;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  // ── Idle ────────────────────────────────────────────────────────────────
  if (state === "idle") {
    return (
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={startCountdown}
          className="relative w-36 h-36 rounded-full bg-red-600 select-none
                     active:scale-95 transition-transform focus:outline-none"
          style={{ boxShadow: "0 0 0 16px rgba(220,38,38,0.15), 0 0 0 32px rgba(220,38,38,0.07)" }}
          aria-label="SOS Emergency Alert. Tap to send."
        >
          <span className="absolute inset-0 rounded-full bg-red-500 animate-sos-ring opacity-60 pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1">
            <AlertTriangle className="w-9 h-9 text-white" fill="white" />
            <span className="text-white font-black text-xl tracking-widest">SOS</span>
          </div>
        </button>
        <p className="text-ink-500 text-sm font-medium">Tap to send alert</p>
      </div>
    );
  }

  // ── Counting ─────────────────────────────────────────────────────────────
  if (state === "counting") {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-red-600 text-sm font-bold tracking-wide uppercase">Sending SOS in…</p>
        <div className="relative w-36 h-36">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 144 144">
            <circle cx="72" cy="72" r={RADIUS} fill="none" stroke="rgba(220,38,38,0.2)" strokeWidth="6" />
            <circle
              cx="72" cy="72" r={RADIUS}
              fill="none" stroke="#dc2626" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 rounded-full bg-red-50 border-2 border-red-100 flex flex-col items-center justify-center">
            <span className="text-red-700 font-black text-5xl leading-none">{Math.ceil(secondsLeft)}</span>
          </div>
        </div>
        <button
          onClick={cancelCountdown}
          className="flex items-center gap-2 px-8 py-4 bg-white border-2 border-red-600 text-red-700
                     font-black text-lg rounded-2xl active:scale-95 transition-transform shadow-lg"
        >
          <X className="w-5 h-5" /> CANCEL
        </button>
      </div>
    );
  }

  // ── Sending ──────────────────────────────────────────────────────────────
  if (state === "sending") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-36 h-36 rounded-full bg-red-600 flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
          <span className="text-white font-bold text-sm">Sending…</span>
        </div>
        <p className="text-ink-500 text-sm">Locating nearest unit</p>
      </div>
    );
  }

  // ── Dispatched ───────────────────────────────────────────────────────────
  if (state === "dispatched" && dispatchInfo) {
    return (
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-green-100 overflow-hidden">
        <div className="bg-green-600 px-5 py-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-white" />
          <span className="text-white font-bold">Help is on the way</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-ink-900 text-lg">{dispatchInfo.officerName}</p>
              <p className="text-ink-500 text-sm">SSF Unit {dispatchInfo.vehicleId}</p>
            </div>
            {dispatchInfo.phone && (
              <a href={`tel:${dispatchInfo.phone}`}
                className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center active:scale-95">
                <Phone className="w-5 h-5 text-green-700" />
              </a>
            )}
          </div>
          <div className="bg-green-50 rounded-xl px-4 py-3 text-center">
            <p className="text-3xl font-black text-green-700">{dispatchInfo.etaMinutes} min</p>
            <p className="text-green-600 text-sm">estimated arrival</p>
          </div>
          <div className="flex items-center gap-2 text-ink-500 text-sm">
            <MapPin className="w-4 h-4 shrink-0" />
            <span>Your location has been shared</span>
          </div>
        </div>
        {onCancel && (
          <div className="border-t border-ink-100 px-5 py-3">
            <button onClick={onCancel}
              className="w-full text-sm text-ink-500 hover:text-ink-700 py-1 transition-colors">
              I'm safe — cancel alert
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Arrived ──────────────────────────────────────────────────────────────
  if (state === "arrived") {
    return (
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-blue-100 overflow-hidden">
        <div className="bg-blue-600 px-5 py-4">
          <p className="text-white font-bold">Officer has arrived</p>
          <p className="text-blue-200 text-sm">Show this screen to the officer</p>
        </div>
        <div className="px-5 py-4 text-center">
          <p className="text-ink-600 text-sm mb-3">You are safe now.</p>
          <button onClick={onCancel}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform">
            Close Alert
          </button>
        </div>
      </div>
    );
  }

  return null;
}
