import { useEffect, useReducer, useRef } from "react";
import { AlertRow, WSMessage } from "../types";

interface AlertState {
  alerts: AlertRow[];
  liveLocations: Record<number, { lat: number; lng: number }>;
  connected: boolean;
}

type AlertAction =
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "INITIAL_STATE"; payload: AlertRow[] }
  | { type: "ALERT_CREATED"; payload: AlertRow }
  | { type: "ALERT_UPDATED"; payload: AlertRow }
  | { type: "LOCATION_UPDATE"; payload: { alert_id: number; lat: number; lng: number } };

function reducer(state: AlertState, action: AlertAction): AlertState {
  switch (action.type) {
    case "SET_CONNECTED":
      return { ...state, connected: action.payload };
    case "INITIAL_STATE":
      return { ...state, alerts: action.payload };
    case "ALERT_CREATED":
      return { ...state, alerts: [action.payload, ...state.alerts] };
    case "ALERT_UPDATED":
      return {
        ...state,
        alerts: state.alerts.map((a) => (a.id === action.payload.id ? action.payload : a)),
      };
    case "LOCATION_UPDATE":
      return {
        ...state,
        liveLocations: {
          ...state.liveLocations,
          [action.payload.alert_id]: {
            lat: action.payload.lat,
            lng: action.payload.lng,
          },
        },
      };
    default:
      return state;
  }
}

export function useAlerts(token: string) {
  const [state, dispatch] = useReducer(reducer, {
    alerts: [],
    liveLocations: {},
    connected: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);

  useEffect(() => {
    if (!token) return;

    // intentionalClose flag prevents onclose from triggering a reconnect
    // when the effect cleans up (React StrictMode double-invokes effects in dev,
    // which would otherwise create two simultaneous WebSocket connections and
    // cause every broadcast to be dispatched twice).
    let intentionalClose = false;

    const connectWebSocket = () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const wsUrl = apiUrl
          ? apiUrl.replace(/^http/, "ws") + `/ws/alerts?token=${token}`
          : `${window.location.protocol.replace("http", "ws")}//${window.location.host}/ws/alerts?token=${token}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          dispatch({ type: "SET_CONNECTED", payload: true });
          reconnectDelayRef.current = 1000;
        };

        ws.onmessage = (event) => {
          try {
            const msg: WSMessage = JSON.parse(event.data);

            if (msg.type === "initial_state" && msg.alerts) {
              dispatch({ type: "INITIAL_STATE", payload: msg.alerts });
            } else if (msg.type === "alert_created" && msg.alert) {
              dispatch({ type: "ALERT_CREATED", payload: msg.alert });
            } else if (msg.type === "alert_updated" && msg.alert) {
              dispatch({ type: "ALERT_UPDATED", payload: msg.alert });
            } else if (msg.type === "location_update" && msg.alert_id && msg.lat !== undefined && msg.lng !== undefined) {
              dispatch({
                type: "LOCATION_UPDATE",
                payload: { alert_id: msg.alert_id, lat: msg.lat, lng: msg.lng },
              });
            }
          } catch (err) {
            console.error("Failed to parse WebSocket message:", err);
          }
        };

        ws.onerror = () => {
          dispatch({ type: "SET_CONNECTED", payload: false });
        };

        ws.onclose = () => {
          dispatch({ type: "SET_CONNECTED", payload: false });
          if (!intentionalClose) {
            // Exponential backoff reconnect: 1s → 2s → 4s → 8s → 30s max
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
              connectWebSocket();
            }, reconnectDelayRef.current);
          }
        };

        wsRef.current = ws;
      } catch (err) {
        console.error("Failed to connect WebSocket:", err);
        dispatch({ type: "SET_CONNECTED", payload: false });
      }
    };

    connectWebSocket();

    return () => {
      intentionalClose = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token]);

  return state;
}
