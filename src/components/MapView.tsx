import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import L from "leaflet";
import { TILES } from "../lib/services";
import { isWaypointSet } from "../lib/data";
import { stopDisplayName, WALBRZYCH_CENTER, WALBRZYCH_ZOOM } from "../lib/busStops";
import type { BusStop, MapStyle, ThemeMode, RouteData, Waypoint } from "../lib/types";

export interface MapHandle {
  fitRoute: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  centerOn: (lat: number, lon: number, zoom?: number) => void;
  getBounds: () => { south: number; west: number; north: number; east: number } | null;
}

interface MapViewProps {
  route: RouteData;
  waypoints: Waypoint[];
  mapStyle: MapStyle;
  theme: ThemeMode;
  fitNonce: number;
  pickMode?: boolean;
  draftMode?: boolean;
  busStops?: BusStop[];
  selectedStopId?: string | null;
  nearRouteIds?: Set<string>;
  usedStopKeys?: Set<string>;
  onBusStopClick?: (stop: BusStop) => void;
  navCoord?: [number, number] | null;
  followNav?: boolean;
  focus?: { lat: number; lon: number; zoom?: number; nonce: number } | null;
  onLineClick: (point: [number, number]) => void;
  onMarkerDrag: (id: string, lat: number, lon: number) => void;
  onMapClick: (lat: number, lon: number) => void;
  onMapContextMenu: (lat: number, lon: number, clientX: number, clientY: number) => void;
}

const vehicleSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.6 3.9 21l8.1-4.7 8.1 4.7L12 2.6Z" fill="currentColor"/></svg>`;

const busGlyph = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11"/><path d="M4 11h16"/><path d="M4 17h16"/><circle cx="7.5" cy="19.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="16.5" cy="19.5" r="1.2" fill="currentColor" stroke="none"/></svg>`;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[
        character
      ] as string
  );

const MapView = forwardRef<MapHandle, MapViewProps>(function MapView(
  {
    route,
    waypoints,
    mapStyle,
    theme,
    fitNonce,
    pickMode = false,
    draftMode = false,
    busStops = [],
    selectedStopId = null,
    nearRouteIds,
    usedStopKeys,
    onBusStopClick,
    navCoord,
    followNav = false,
    focus,
    onLineClick,
    onMarkerDrag,
    onMapClick,
    onMapContextMenu,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer[]>([]);
  const routeGroupRef = useRef<L.LayerGroup | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const stopGroupRef = useRef<L.LayerGroup | null>(null);
  const stopMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const stopStateRef = useRef<Map<string, string>>(new Map());
  const navMarkerRef = useRef<L.Marker | null>(null);
  const hasFittedRef = useRef(false);
  const lastFitNonceRef = useRef(-1);

  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;
  const lineClickRef = useRef(onLineClick);
  const dragRef = useRef(onMarkerDrag);
  const mapClickRef = useRef(onMapClick);
  const contextMenuRef = useRef(onMapContextMenu);
  const stopClickRef = useRef(onBusStopClick);
  stopClickRef.current = onBusStopClick;
  lineClickRef.current = onLineClick;
  dragRef.current = onMarkerDrag;
  mapClickRef.current = onMapClick;
  contextMenuRef.current = onMapContextMenu;

  const routeRef = useRef(route);
  routeRef.current = route;

  const fitBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    const coords = routeRef.current.coords;
    if (!coords.length) return;
    const bounds = L.latLngBounds(coords);
    const narrow = window.innerWidth < 1024;
    map.fitBounds(bounds, {
      paddingTopLeft: narrow ? [32, 110] : [56, 90],
      paddingBottomRight: narrow ? [32, 190] : [70, 150],
      maxZoom: 15,
      animate: true,
      duration: 0.8,
    });
  };

  useImperativeHandle(ref, () => ({
    fitRoute: fitBounds,
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    centerOn: (lat, lon, zoom = 13) =>
      mapRef.current?.flyTo([lat, lon], zoom, { duration: 0.8 }),
    getBounds: () => {
      const bounds = mapRef.current?.getBounds();
      if (!bounds) return null;
      return {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      };
    },
  }));

  /* Initialise the map once. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 4,
      maxZoom: 19,
      zoomSnap: 0.5,
      preferCanvas: false,
    }).setView(WALBRZYCH_CENTER, WALBRZYCH_ZOOM);
    // Exposed so automated checks can verify marker placement against the projection.
    (container as HTMLElement & { __map?: L.Map }).__map = map;
    map.attributionControl.setPrefix(
      '<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>'
    );
    mapRef.current = map;
    const labelPane = map.createPane("labels");
    labelPane.style.zIndex = "250";
    labelPane.style.pointerEvents = "none";
    const stopPane = map.createPane("stops");
    stopPane.style.zIndex = "540";
    routeGroupRef.current = L.layerGroup().addTo(map);
    stopGroupRef.current = L.layerGroup().addTo(map);
    markerGroupRef.current = L.layerGroup().addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      mapClickRef.current(event.latlng.lat, event.latlng.lng);
    });
    map.on("contextmenu", (event: L.LeafletMouseEvent) => {
      const original = event.originalEvent as MouseEvent | undefined;
      if (!original) return;
      L.DomEvent.stop(original);
      contextMenuRef.current(event.latlng.lat, event.latlng.lng, original.clientX, original.clientY);
    });

    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(container);

    return () => {
      observer.disconnect();
      tileRef.current = [];
      stopMarkersRef.current.clear();
      stopStateRef.current.clear();
      delete (container as HTMLElement & { __map?: L.Map }).__map;
      map.remove();
      mapRef.current = null;
      routeGroupRef.current = null;
      markerGroupRef.current = null;
      stopGroupRef.current = null;
      navMarkerRef.current = null;
      hasFittedRef.current = false;
    };
  }, []);

  /* Base tiles + an independent label reference layer. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current.forEach((layer) => layer.remove());
    const config = TILES[mapStyle];
    const base = L.tileLayer(config.base, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
      maxNativeZoom: config.maxZoom,
      detectRetina: true,
      crossOrigin: true,
      className: "basemap-layer",
    });
    base.addTo(map);
    const layers = [base];
    if (config.labels) {
      const labels = L.tileLayer(config.labels, {
        maxZoom: config.maxZoom,
        maxNativeZoom: config.maxZoom,
        detectRetina: true,
        crossOrigin: true,
        pane: "labels",
        className: "basemap-labels",
        opacity: mapStyle === "satellite" ? 0.85 : 1,
      });
      labels.addTo(map);
      layers.push(labels);
    }
    tileRef.current = layers;
  }, [mapStyle]);

  /* Draw the route. */
  useEffect(() => {
    const map = mapRef.current;
    const group = routeGroupRef.current;
    if (!map || !group) return;
    group.clearLayers();
    if (route.coords.length < 2) return;

    const darkTiles = mapStyle !== "light";
    const main = darkTiles ? "#d7f36e" : "#0d4f3b";
    const casing = darkTiles ? "#0a1712" : "#ffffff";
    const flow = darkTiles ? "#3b6b4f" : "#d7f36e";

    L.polyline(route.coords, {
      color: casing,
      weight: 11,
      opacity: 0.96,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    }).addTo(group);

    L.polyline(route.coords, {
      color: main,
      weight: 5.2,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
      className: "route-main",
      interactive: false,
    }).addTo(group);

    L.polyline(route.coords, {
      color: flow,
      weight: 2.6,
      opacity: 0.95,
      lineCap: "round",
      className: "route-flow",
      interactive: false,
    }).addTo(group);

    const hitArea = L.polyline(route.coords, {
      color: "#000000",
      weight: 26,
      opacity: 0.001,
      lineCap: "round",
    }).addTo(group);

    let suppressClick = false;

    /* Pressing and dragging the line creates a new intermediate stop. */
    hitArea.on("mousedown", (event: L.LeafletMouseEvent) => {
      const mapInstance = mapRef.current;
      if (!mapInstance || !event.originalEvent || pickModeRef.current) return;
      L.DomEvent.stop(event.originalEvent);
      const ghost = L.marker(event.latlng, {
        icon: L.divIcon({
          className: "pin-wrap",
          html: '<div class="pin pin--via" style="box-shadow:0 0 0 6px rgba(13,79,59,.16), 0 6px 18px rgba(5,30,20,.28)">+</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        interactive: false,
        zIndexOffset: 1500,
      }).addTo(mapInstance);
      mapInstance.dragging.disable();
      let finished = false;

      const finish = (latlng: L.LatLng | null) => {
        if (finished) return;
        finished = true;
        mapInstance.off("mousemove", move);
        mapInstance.off("mouseup", up);
        window.removeEventListener("mouseup", documentUp, true);
        mapInstance.removeLayer(ghost);
        mapInstance.dragging.enable();
        if (!latlng) return;
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 320);
        lineClickRef.current([latlng.lat, latlng.lng]);
      };

      const move = (moveEvent: L.LeafletMouseEvent) => ghost.setLatLng(moveEvent.latlng);
      const up = (upEvent: L.LeafletMouseEvent) => finish(upEvent.latlng);
      const documentUp = (documentEvent: MouseEvent) =>
        finish(mapInstance.mouseEventToLatLng(documentEvent));

      mapInstance.on("mousemove", move);
      mapInstance.on("mouseup", up);
      window.addEventListener("mouseup", documentUp, true);
    });

    hitArea.on("click", (event: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(event.originalEvent);
      if (suppressClick) return;
      if (pickModeRef.current) {
        mapClickRef.current(event.latlng.lat, event.latlng.lng);
        return;
      }
      lineClickRef.current([event.latlng.lat, event.latlng.lng]);
    });
    hitArea.bindTooltip("Przeciągnij lub kliknij, aby dodać punkt pośredni", {
      sticky: true,
      direction: "top",
      className: "waypoint-tooltip waypoint-tooltip--hint",
      offset: [0, -8],
    });
    hitArea.bringToFront();

    if (!hasFittedRef.current || lastFitNonceRef.current !== fitNonce) {
      hasFittedRef.current = true;
      lastFitNonceRef.current = fitNonce;
      window.setTimeout(fitBounds, 140);
    }
  }, [route, mapStyle, fitNonce]);

  /* Draw draggable waypoint pins. */
  useEffect(() => {
    const group = markerGroupRef.current;
    if (!group) return;
    group.clearLayers();
    const assigned = waypoints.filter(isWaypointSet);
    if (draftMode && assigned.length >= 2) {
      L.polyline(assigned.map((point) => [point.lat, point.lon] as [number, number]), {
        color: "#5f866e", weight: 2, dashArray: "5 7", interactive: false,
      }).addTo(group);
    }

    waypoints.forEach((waypoint, index) => {
      if (!isWaypointSet(waypoint)) return;
      const isStart = index === 0;
      const isEnd = index === waypoints.length - 1;
      const viaIndex = index;
      const label = isStart ? "A" : isEnd ? "B" : String(viaIndex);
      const modifier = isStart ? "start" : isEnd ? "end" : "via";
      const icon = L.divIcon({
        className: "pin-wrap",
        html: `<div class="pin pin--${modifier}" aria-label="${escapeHtml(waypoint.short)}">${label}</div>`,
        iconSize: isStart || isEnd ? [32, 32] : [26, 26],
        iconAnchor: isStart || isEnd ? [16, 16] : [13, 13],
      });
      const marker = L.marker([waypoint.lat, waypoint.lon], {
        icon,
        draggable: true,
        autoPan: true,
        riseOnHover: true,
        zIndexOffset: isStart || isEnd ? 600 : 400,
        title: waypoint.label,
      });
      marker.bindTooltip(escapeHtml(waypoint.short), {
        permanent: isStart || isEnd || waypoints.length <= 6,
        direction: "bottom",
        offset: [0, isStart || isEnd ? 18 : 14],
        className: "waypoint-tooltip",
      });
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        dragRef.current(waypoint.id, position.lat, position.lng);
      });
      marker.addTo(group);
    });
  }, [waypoints, draftMode]);

  /* Bus stops from OpenStreetMap (Overpass): always drawn, at their exact mapped position. */
  useEffect(() => {
    const group = stopGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    stopMarkersRef.current.clear();
    stopStateRef.current.clear();
    if (!busStops.length) return;

    let cancelled = false;
    let chunk = 0;
    const CHUNK_SIZE = 90;

    // Chunked creation keeps the map interactive while hundreds of stops appear.
    const drawChunk = () => {
      if (cancelled) return;
      const slice = busStops.slice(chunk * CHUNK_SIZE, chunk * CHUNK_SIZE + CHUNK_SIZE);
      for (const stop of slice) {
        const marker = L.marker([stop.lat, stop.lon], {
          icon: stopIcon(stop.id, stopState(stop)),
          pane: "stops",
          title: stop.name,
          keyboard: false,
          riseOnHover: true,
        });
        marker.bindTooltip(escapeHtml(stopDisplayName(stop)), {
          direction: "right",
          offset: [12, 0],
          className: "stop-name-label",
          opacity: 1,
        });
        marker.on("click", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event.originalEvent);
          stopClickRef.current?.(stop);
        });
        marker.addTo(group);
        stopMarkersRef.current.set(stop.id, marker);
        stopStateRef.current.set(stop.id, stopState(stop));
      }
      chunk += 1;
      if (chunk * CHUNK_SIZE < busStops.length) requestAnimationFrame(drawChunk);
      else refreshLabels();
    };

    const stopState = (stop: BusStop) =>
      [
        stop.id === selectedStopId ? "on" : "",
        nearRouteIds?.has(stop.id) ? "route" : "",
        usedStopKeys?.has(`${stop.lat.toFixed(5)},${stop.lon.toFixed(5)}`) ? "used" : "",
      ].join("|");

    const stopIcon = (id: string, state: string) =>
      L.divIcon({
        className: "pin-wrap",
        html: `<span class="bus-stop${state.includes("on") ? " bus-stop--on" : ""}${
          state.includes("route") ? " bus-stop--route" : ""
        }${state.includes("used") ? " bus-stop--used" : ""}" data-stop-id="${escapeHtml(id)}" aria-hidden="true">${busGlyph}</span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

    const refreshLabels = () => {
      const showNames = map.getZoom() >= 16;
      const area = map.getBounds().pad(0.05);
      stopMarkersRef.current.forEach((marker) => {
        if (showNames && area.contains(marker.getLatLng())) marker.openTooltip();
        else marker.closeTooltip();
      });
    };
    map.on("zoomend moveend", refreshLabels);
    drawChunk();
    return () => {
      cancelled = true;
      map.off("zoomend moveend", refreshLabels);
    };
  }, [busStops]);

  /* Highlight state changes touch only the markers that actually changed. */
  useEffect(() => {
    if (!busStops.length) return;
    for (const stop of busStops) {
      const marker = stopMarkersRef.current.get(stop.id);
      if (!marker) continue;
      const state = [
        stop.id === selectedStopId ? "on" : "",
        nearRouteIds?.has(stop.id) ? "route" : "",
        usedStopKeys?.has(`${stop.lat.toFixed(5)},${stop.lon.toFixed(5)}`) ? "used" : "",
      ].join("|");
      if (stopStateRef.current.get(stop.id) === state) continue;
      stopStateRef.current.set(stop.id, state);
      marker.setIcon(
        L.divIcon({
          className: "pin-wrap",
          html: `<span class="bus-stop${state.includes("on") ? " bus-stop--on" : ""}${
            state.includes("route") ? " bus-stop--route" : ""
          }${state.includes("used") ? " bus-stop--used" : ""}" data-stop-id="${escapeHtml(stop.id)}" aria-hidden="true">${busGlyph}</span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        })
      );
      marker.setZIndexOffset(state.includes("on") ? 900 : state.includes("used") ? 400 : 0);
    }
  }, [selectedStopId, nearRouteIds, usedStopKeys, busStops]);

  /* Navigation playback marker. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!navCoord) {
      if (navMarkerRef.current) {
        map.removeLayer(navMarkerRef.current);
        navMarkerRef.current = null;
      }
      return;
    }
    const icon = L.divIcon({
      className: "pin-wrap",
      html: `<div class="nav-vehicle">${vehicleSvg}</div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });
    if (!navMarkerRef.current) {
      navMarkerRef.current = L.marker(navCoord, { icon, zIndexOffset: 1200, interactive: false }).addTo(map);
    } else {
      navMarkerRef.current.setLatLng(navCoord);
    }
    if (followNav) {
      map.panInside(navCoord, {
        paddingTopLeft: [90, 120],
        paddingBottomRight: [90, 170],
        animate: true,
        duration: 0.45,
      });
    }
  }, [navCoord, followNav]);

  /* Focus a manoeuvre from the instructions drawer. */
  useEffect(() => {
    if (!focus || !mapRef.current) return;
    mapRef.current.flyTo([focus.lat, focus.lon], focus.zoom ?? 14, { duration: 0.9 });
  }, [focus]);

  const tileTone = mapStyle === "satellite" ? "satellite" : theme;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={containerRef}
        className="h-full w-full outline-none"
        style={{ cursor: pickMode ? "crosshair" : undefined }}
        role="application"
        aria-label="Interaktywna mapa trasy"
      />
      {mapStyle === "satellite" && (
        <div className="pointer-events-none absolute inset-0 bg-[#06110c]/20" aria-hidden="true" />
      )}
      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0_0_90px_rgba(7,35,24,0.12)] dark:shadow-[inset_0_0_100px_rgba(0,0,0,0.35)]"
        aria-hidden="true"
        data-tone={tileTone}
      />
    </div>
  );
});

export default MapView;
