import { useEffect, useRef, useState } from "react";
import { AlertRow, WSMessage } from "../types";

export function usePatrolAlerts(token: string, vehicleId: number) {
  const [myAlert, setMyAlert] = useState<AlertRow | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(1000);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token || !vehicleId) return;
    let intentionalClose = false;

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
              const mine = msg.alerts.find(
                a => a.dispatched_vehicle_id === vehicleId &&
                     a.status !== "resolved" && a.status !== "cancelled"
              ) ?? null;
              setMyAlert(mine);
            } else if (msg.type === "alert_updated" && msg.alert) {
              const a = msg.alert;
              const isResolved = a.status === "resolved" || a.status === "cancelled";
              if (a.dispatched_vehicle_id === vehicleId && !isResolved) {
                setMyAlert(a);
              } else {
                // Alert resolved, cancelled, or un-assigned from this vehicle
                setMyAlert(prev => (prev?.id === a.id ? null : prev));
              }
            } else if (msg.type === "alert_created" && msg.alert) {
              const a = msg.alert;
              if (a.dispatched_vehicle_id === vehicleId) setMyAlert(a);
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

  return { myAlert, connected };
}
