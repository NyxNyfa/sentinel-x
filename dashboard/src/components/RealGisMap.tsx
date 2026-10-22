import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Compass,
  Crosshair,
  Maximize2,
  MapPin,
} from 'lucide-react';
import type { PrototypeNode } from '../types/sentinel';
import { isSameNode } from '../utils/sentinelNodeUtils';

interface RealGisMapProps {
  prototypes: PrototypeNode[];
  activeNodeId: string;
  selectNode: (nodeId: string) => void;
  onPickCoordinates?: (lat: number, lng: number) => void;
  pickModeActive?: boolean;
  onOpenEditCoordsModal?: (prototype: PrototypeNode) => void;
}

// Center of Indonesia archipelago
const INDONESIA_CENTER: [number, number] = [-2.5489, 118.0149];
const INDONESIA_DEFAULT_ZOOM = 5;

export const RealGisMap: React.FC<RealGisMapProps> = ({
  prototypes,
  activeNodeId,
  selectNode,
  onPickCoordinates,
  pickModeActive = false,
  onOpenEditCoordsModal,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const polylinesLayerRef = useRef<L.LayerGroup | null>(null);
  const pickMarkerRef = useRef<L.Marker | null>(null);

  const [clickedCoord, setClickedCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [pickNotice, setPickNotice] = useState<string | null>(null);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Find initial center from active prototype, or fallback to Indonesia center
      const activeProto = prototypes.find((p) => isSameNode(p.nodeId, activeNodeId));
      const initialCenter: [number, number] =
        activeProto && !isNaN(activeProto.latitude) && !isNaN(activeProto.longitude)
          ? [activeProto.latitude, activeProto.longitude]
          : INDONESIA_CENTER;
      const initialZoom = activeProto ? 11 : INDONESIA_DEFAULT_ZOOM;

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 4,
        maxZoom: 18,
        zoomControl: false,
      });

      // Standard OpenStreetMap Tile Layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Add Zoom control at top-right
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Dedicated layers for markers and transmission lines
      markersLayerRef.current = L.layerGroup().addTo(map);
      polylinesLayerRef.current = L.layerGroup().addTo(map);

      // Map Click Handler (for coordinate picking)
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        const roundedLat = Number(lat.toFixed(6));
        const roundedLng = Number(lng.toFixed(6));
        setClickedCoord({ lat: roundedLat, lng: roundedLng });

        if (onPickCoordinates) {
          onPickCoordinates(roundedLat, roundedLng);
          setPickNotice(
            `Titik dipilih: [Lat: ${roundedLat}, Lng: ${roundedLng}]`
          );
          setTimeout(() => setPickNotice(null), 4000);
        }

        // Show a temporary picker marker
        if (pickMarkerRef.current) {
          pickMarkerRef.current.setLatLng([lat, lng]);
        } else {
          const pickerIcon = L.divIcon({
            className: 'picker-div-icon',
            html: `
              <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                <div style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: rgba(22, 184, 200, 0.35); border: 2px dashed #006972;"></div>
                <div style="width: 12px; height: 12px; border-radius: 50%; background: #16B8C8; border: 2px solid #FFFFFF; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>
              </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          pickMarkerRef.current = L.marker([lat, lng], { icon: pickerIcon }).addTo(map);
        }
      });

      mapInstanceRef.current = map;
    }

    // Invalidate size in case container size changed (e.g. tabs switched)
    const resizeTimer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(resizeTimer);
    };
  }, []);

  // Update Markers & Polylines whenever prototypes, activeNodeId, or telemetry changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const polylinesLayer = polylinesLayerRef.current;
    if (!map || !markersLayer || !polylinesLayer) return;

    markersLayer.clearLayers();
    polylinesLayer.clearLayers();

    const validNodes = prototypes.filter(
      (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number' && !isNaN(p.latitude) && !isNaN(p.longitude)
    );

    // 1. Draw transmission lines between valid prototypes
    if (validNodes.length > 1) {
      const linePoints: L.LatLngExpression[] = validNodes.map((p) => [p.latitude, p.longitude]);
      const anyAlert = validNodes.some(
        (p) =>
          p.telemetry.relay_trip ||
          p.telemetry.status === 'EVENT_ALERT' ||
          p.telemetry.ai_engine.threat_idx > 55
      );
      const allConnected = validNodes.every((p) => p.connected);

      L.polyline(linePoints, {
        color: anyAlert ? '#DC2626' : '#006972',
        weight: 3,
        opacity: 0.85,
        dashArray: allConnected ? undefined : '6, 6',
      }).addTo(polylinesLayer);
    }

    // 2. Add SCADA Pulsing Markers
    validNodes.forEach((node) => {
      const isSelected = isSameNode(node.nodeId, activeNodeId);
      const isTripped = node.telemetry.relay_trip;
      const isAlert = node.telemetry.status === 'EVENT_ALERT' || node.telemetry.ai_engine.threat_idx > 55;

      const mainColor = isTripped
        ? '#DC2626'
        : isAlert
          ? '#D97706'
          : node.connected
            ? '#16A34A'
            : '#64748B';

      const iconHtml = `
        <div class="scada-marker-pulse" style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; ${
            isSelected || isAlert || isTripped ? 'animation: scada-marker-pulse 2s infinite;' : ''
          } border: 2px solid ${mainColor}; background-color: ${mainColor}25;"></div>
          <div style="position: relative; width: ${isSelected ? '15px' : '12px'}; height: ${
        isSelected ? '15px' : '12px'
      }; border-radius: 50%; background-color: ${mainColor}; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 5px rgba(0,0,0,0.35);"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'scada-node-divicon',
        html: iconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });

      const marker = L.marker([node.latitude, node.longitude], {
        icon: customIcon,
        title: `${node.nodeId} (${node.substationName})`,
      });

      // Construct interactive SCADA Popup content
      const popupDiv = document.createElement('div');
      popupDiv.className = 'p-3 text-xs text-[#172B4D] min-w-[240px] space-y-2';

      const latLabel = `${Math.abs(node.latitude).toFixed(4)}°${node.latitude < 0 ? 'S' : 'N'}`;
      const lngLabel = `${Math.abs(node.longitude).toFixed(4)}°${node.longitude < 0 ? 'W' : 'E'}`;

      popupDiv.innerHTML = `
        <div class="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
          <div>
            <div class="font-bold text-[#15345B] text-sm font-mono flex items-center gap-1.5">
              <span>${node.nodeId}</span>
              ${
                isSelected
                  ? '<span class="px-1.5 py-0.2 rounded bg-[#15345B] text-white text-[9px] font-sans font-semibold">Aktif</span>'
                  : ''
              }
            </div>
            <div class="text-[11px] text-[#64748B]">${node.substationName} • ${node.bayName}</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
            isTripped
              ? 'bg-[#DC2626]/10 text-[#DC2626]'
              : isAlert
                ? 'bg-[#D97706]/10 text-[#D97706]'
                : node.connected
                  ? 'bg-[#16A34A]/10 text-[#16A34A]'
                  : 'bg-[#64748B]/10 text-[#64748B]'
          }">
            ${isTripped ? 'CUT-OFF' : node.connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        <div class="space-y-1 text-[11px] font-mono tabular-nums bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0]">
          <div class="flex justify-between">
            <span class="text-[#64748B]">Koordinat:</span>
            <span class="font-semibold text-[#15345B]">${latLabel}, ${lngLabel}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[#64748B]">Arus RMS:</span>
            <span class="font-semibold">${node.telemetry.metrics.I_rms.toFixed(2)} A</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[#64748B]">Kadar Gas:</span>
            <span class="font-semibold">${node.telemetry.metrics.gas_ppm.toFixed(0)} PPM</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[#64748B]">Getaran MPU:</span>
            <span class="font-semibold">${node.telemetry.metrics.vib_g.toFixed(4)} g</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[#64748B]">Threat Index:</span>
            <span class="font-semibold ${
              node.telemetry.ai_engine.threat_idx > 55 ? 'text-[#DC2626]' : 'text-[#16A34A]'
            }">${node.telemetry.ai_engine.threat_idx}%</span>
          </div>
        </div>

        <div class="flex items-center gap-1.5 pt-1">
          <button id="btn-select-${node.nodeId}" class="flex-1 py-1.5 px-2 rounded bg-[#15345B] hover:bg-[#001f40] text-white text-[11px] font-semibold text-center cursor-pointer transition-colors">
            Pilih Prototype Ini
          </button>
          <button id="btn-edit-${node.nodeId}" class="py-1.5 px-2 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#172B4D] text-[11px] font-semibold cursor-pointer transition-colors" title="Edit Titik Koordinat">
            Edit
          </button>
        </div>
      `;

      // Attach event listeners to popup buttons
      marker.bindPopup(popupDiv);
      marker.on('popupopen', () => {
        const selectBtn = document.getElementById(`btn-select-${node.nodeId}`);
        if (selectBtn) {
          selectBtn.onclick = () => {
            selectNode(node.nodeId);
            marker.closePopup();
          };
        }
        const editBtn = document.getElementById(`btn-edit-${node.nodeId}`);
        if (editBtn && onOpenEditCoordsModal) {
          editBtn.onclick = () => {
            onOpenEditCoordsModal(node);
            marker.closePopup();
          };
        }
      });

      marker.addTo(markersLayer);
    });
  }, [prototypes, activeNodeId, selectNode, onOpenEditCoordsModal]);

  // Handle flyTo when active prototype changes
  const flyToActiveNode = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const active = prototypes.find((p) => isSameNode(p.nodeId, activeNodeId));
    if (active && typeof active.latitude === 'number' && typeof active.longitude === 'number' && !isNaN(active.latitude)) {
      map.flyTo([active.latitude, active.longitude], 13, { duration: 1.2 });
    }
  };

  const resetToIndonesia = () => {
    mapInstanceRef.current?.flyTo(INDONESIA_CENTER, INDONESIA_DEFAULT_ZOOM, { duration: 1.2 });
  };

  const fitAllMarkers = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const valid = prototypes.filter(
      (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number' && !isNaN(p.latitude)
    );
    if (valid.length === 0) {
      resetToIndonesia();
      return;
    }
    const bounds = L.latLngBounds(valid.map((p) => [p.latitude, p.longitude]));
    map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 14, duration: 1.2 });
  };

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-[#d3e4fe] bg-[#eff4ff] shadow-xs">
      {/* Real Map Canvas Container */}
      <div
        ref={mapContainerRef}
        className="w-full h-80 sm:h-96 z-10"
        style={{ cursor: pickModeActive ? 'crosshair' : 'grab' }}
      />

      {/* Map Control Buttons floating on Top-Left */}
      <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-xs p-1.5 rounded-lg border border-[#E2E8F0] shadow-sm text-xs">
        <button
          type="button"
          onClick={flyToActiveNode}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#15345B] hover:bg-[#001f40] text-white font-semibold transition-colors cursor-pointer"
          title="Pusatkan peta ke Prototype aktif saat ini"
        >
          <Crosshair className="w-3.5 h-3.5 text-[#67ecfd]" />
          <span>Fokus Node Aktif</span>
        </button>

        <button
          type="button"
          onClick={resetToIndonesia}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#172B4D] font-medium transition-colors cursor-pointer"
          title="Tampilkan peta seluruh wilayah Indonesia"
        >
          <Compass className="w-3.5 h-3.5 text-[#006972]" />
          <span className="hidden sm:inline">Peta Indonesia</span>
        </button>

        <button
          type="button"
          onClick={fitAllMarkers}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#172B4D] font-medium transition-colors cursor-pointer"
          title="Zoom agar seluruh prototype masuk layar"
        >
          <Maximize2 className="w-3.5 h-3.5 text-[#64748B]" />
          <span className="hidden sm:inline">Fit Semua</span>
        </button>
      </div>

      {/* Click-to-Pick Coordinate Banner / Notification floating on Bottom-Left */}
      {(pickNotice || clickedCoord) && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto z-20 bg-white/95 backdrop-blur-xs px-3.5 py-2 rounded-lg border border-[#d3e4fe] shadow-md flex items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#006972] shrink-0" />
            <div>
              <span className="text-[#64748B]">Koordinat Terpilih: </span>
              <strong className="font-mono text-[#15345B] tabular-nums">
                Lat: {clickedCoord?.lat}, Lng: {clickedCoord?.lng}
              </strong>
            </div>
          </div>
          {onPickCoordinates && (
            <span className="text-[11px] font-semibold text-[#16A34A] bg-[#16A34A]/10 px-2 py-0.5 rounded">
              Tersalin ke Form
            </span>
          )}
        </div>
      )}

      {/* Bottom Map Info Footer */}
      <div className="absolute bottom-1 right-2 z-20 text-[10px] text-[#64748B] bg-white/80 px-2 py-0.5 rounded pointer-events-none">
        OpenStreetMap Standard • Fokus Indonesia
      </div>
    </div>
  );
};
