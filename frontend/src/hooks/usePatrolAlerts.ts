import { useEffect, useRef, useState } from "react";
import { AlertRow, WSMessage } from "../types";

export function usePatrolAlerts(token: string, vehicleId: number) {
  // Queue: dispatched alerts waiting for patrol to accept/reject
  const [alertQueue, setAlertQueue] = useState<AlertRow[]>([]);
  // Active: the alert that is acknowledged or on_scene
  const [myAlert, setMyAlert] = useState<AlertRow | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(1000);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token || !vehicleId) return;
    let intentionalClose = false;

    const applyAlert = (a: AlertRow) => {
      const isResolved = a.status === "resolved" || a.status === "cancelled" || a.status === "pending";
      const isActive   = a.status === "acknowledged" || a.status === "on_scene";
      const isQueued   = a.status === "dispatched" && a.dispatched_vehicle_id === vehicleId;

      if (isResolved) {
        // Returned to pending (rejected) or resolved — remove from everywhere
        setMyAlert(prev => (prev?.id === a.id ? null : prev));
        setAlertQueue(prev => prev.filter(q => q.id !== a.id));
      } else if (isActive && a.dispatched_vehicle_id === vehicleId) {
        setMyAlert(a);
        setAlertQueue(prev => prev.filter(q => q.id !== a.id));
      } else if (isQueued) {
        setAlertQueue(prev => {
          const exists = prev.find(q => q.id === a.id);
          if (exists) return prev.map(q => q.id === a.id ? a : q);
          return [...prev, a];
        });
        setMyAlert(prev => (prev?.id === a.id ? null : prev));
      }
    };

    const connect = () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const wsUrl = apiUrl
          ? apiUrl.replace(/^http/, "ws") + `/ws/alerts?token=${token}`
          : `${window.location.protocol.replace("http", "ws")}//${window.location.host}/ws/alerts?token=${token}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          reconnectDelayRef.current = 1000;
        };

        ws.onmessage = (event) => {
          try {
            const msg: WSMessage = JSON.parse(event.data);

            if (msg.type === "initial_state" && msg.alerts) {
              const forMe = msg.alerts.filter(a => a.dispatched_vehicle_id === vehicleId);
              const active = forMe.find(a => a.status === "acknowledged" || a.status === "on_scene") ?? null;
              const queue  = forMe.filter(a => a.status === "dispatched");
              setMyAlert(active);
              setAlertQueue(queue);
            } else if (msg.type === "alert_updated" && msg.alert) {
              applyAlert(msg.alert);
            } else if (msg.type === "alert_created" && msg.alert) {
              if (msg.alert.dispatched_vehicle_id === vehicleId) applyAlert(msg.alert);
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onerror = () => setConnected(false);

        ws.onclose = () => {
          setConnected(false);
          if (!intentionalClose) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
              connect();
            }, reconnectDelayRef.current);
          }
        };
      } catch {
        setConnected(false);
      }
    };

    connect();

    return () => {
      intentionalClose = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [token, vehicleId]);

  return { myAlert, alertQueue, connected };
}
