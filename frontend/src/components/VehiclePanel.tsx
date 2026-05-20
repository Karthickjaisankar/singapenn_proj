import { PatrolVehicle } from "../types";
import { AlertCircle, Navigation, Radio } from "lucide-react";

interface VehiclePanelProps {
  vehicles: PatrolVehicle[];
}

export default function VehiclePanel({ vehicles }: VehiclePanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="w-5 h-5 text-accent-blue" />
        <h3 className="font-semibold text-ink-900">Active Patrols</h3>
      </div>

      {vehicles.length === 0 ? (
        <div className="text-center py-8 text-ink-500">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No vehicles assigned</p>
        </div>
      ) : (
        vehicles.map((vehicle) => (
          <div
            key={vehicle.id}
            className="border border-ink-200 rounded-lg p-3 hover:border-accent-blue/50 transition bg-white shadow-sm"
          >
            {/* Vehicle header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{
                    background: vehicle.status === "responding" ? "#dc2626" : "#1e40af",
                  }}
                >
                  {vehicle.id}
                </div>
                <div>
                  <div className="font-semibold text-ink-900">Vehicle {vehicle.id}</div>
                  <div className="text-xs text-ink-500">Zone {vehicle.zone_id}</div>
                </div>
              </div>
              <div
                className={`px-2 py-1 rounded text-xs font-medium ${
                  vehicle.status === "responding"
                    ? "bg-severity-severe/10 text-severity-severe"
                    : "bg-severity-low/10 text-severity-low"
                }`}
              >
                {vehicle.status === "responding" ? "🚨 Responding" : "🛡️ Patrolling"}
              </div>
            </div>

            {/* Position and route */}
            <div className="text-xs space-y-2 text-ink-600">
              <div className="flex items-center gap-2">
                <Navigation className="w-3 h-3 flex-shrink-0" />
                <span>
                  Lat: {vehicle.lat.toFixed(4)} Lng: {vehicle.lng.toFixed(4)}
                </span>
              </div>

              {vehicle.incident_location && (
                <div className="flex items-center gap-2 text-severity-severe">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>Incident at {vehicle.incident_location[0].toFixed(4)}, {vehicle.incident_location[1].toFixed(4)}</span>
                </div>
              )}

              {vehicle.current_route && vehicle.current_route.length > 0 && (
                <div className="text-ink-500">
                  Route: {vehicle.current_route.length} waypoints
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {/* Dispatch info */}
      <div className="mt-6 p-3 bg-accent-blue/5 border border-accent-blue/20 rounded-lg text-xs text-ink-600">
        <p className="font-semibold text-ink-900 mb-1">How to Dispatch</p>
        <p>Click on any location on the map to dispatch the nearest available vehicle to that incident.</p>
      </div>
    </div>
  );
}
