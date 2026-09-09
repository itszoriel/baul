"use client";

import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import ThreeGlobe from "three-globe";

/**
 * One glowing dot: an AGGREGATE stat for a coarse place (a country or an
 * administrative division), already carrying its centroid and display counts.
 * The scene knows nothing about the stats tables — Landing prepares these.
 */
export interface GlobeStatPoint {
  key: string;
  name: string;
  lat: number;
  lng: number;
  vault_count: number;
  duo_count: number;
  circle_count: number;
  memory_count: number;
  song_count: number;
}

/**
 * The public globe (spec §2.5): an abstract constellation Earth — graticule
 * lines, glowing brass points sized by aggregate vault counts per coarse
 * place. It is generated from delayed aggregate rows: no individual creation
 * event, map detail, or vault is ever rendered.
 */
function GlobeObject({
  points,
  onPointClick,
}: {
  points: GlobeStatPoint[];
  onPointClick: (point: GlobeStatPoint) => void;
}) {
  const globe = useMemo(() => {
    const g = new ThreeGlobe({ animateIn: false })
      .showAtmosphere(true)
      .atmosphereColor("#d8bd78")
      .atmosphereAltitude(0.13)
      .showGraticules(true)
      // Continents as a faint dot-matrix — real geography, still abstract.
      .hexPolygonResolution(3)
      .hexPolygonMargin(0.62)
      .hexPolygonAltitude(0.004)
      .hexPolygonColor(() => "rgba(233, 235, 248, 0.22)")
      .customThreeObject((datum) => {
        const point = datum as GlobeStatPoint;
        const size = Math.min(3.2, 1.45 + Math.log10(point.vault_count + 1) * 0.65);
        const beacon = new THREE.Group();

        // Three-globe's normal point layer is a cylinder, which looks like a
        // dash when it reaches the globe's silhouette. A sphere stays round
        // from every angle, while the translucent shell gives it a quiet
        // capiz-lantern glow without obscuring the map beneath it.
        const aura = new THREE.Mesh(
          new THREE.SphereGeometry(size * 2.15, 18, 14),
          new THREE.MeshBasicMaterial({
            color: "#d9b75f",
            transparent: true,
            opacity: 0.13,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        aura.renderOrder = 1;

        const core = new THREE.Mesh(
          new THREE.SphereGeometry(size, 24, 18),
          new THREE.MeshStandardMaterial({
            color: "#f2d783",
            emissive: "#b88428",
            emissiveIntensity: 1.15,
            roughness: 0.28,
            metalness: 0.12,
          }),
        );
        core.renderOrder = 2;

        beacon.add(aura, core);
        return beacon;
      })
      .customThreeObjectUpdate((object, datum) => {
        const point = datum as GlobeStatPoint;
        const altitude = 0.045 + Math.min(0.025, Math.log10(point.vault_count + 1) * 0.01);
        Object.assign(object.position, g.getCoords(point.lat, point.lng, altitude));
      });

    const material = g.globeMaterial() as THREE.MeshPhongMaterial;
    material.color = new THREE.Color("#0f1430");
    material.emissive = new THREE.Color("#080c1e");
    material.shininess = 0.8;
    return g;
  }, []);

  // Country shapes (Natural Earth 110m, geometry only) live in /public so the
  // heavy data never blocks the bundle; the globe works bare until it lands.
  useEffect(() => {
    let alive = true;
    fetch("/land-110m.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((geo: { features?: object[] } | null) => {
        if (alive && geo?.features) globe.hexPolygonsData(geo.features);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [globe]);

  useEffect(() => {
    globe.customLayerData(points);
  }, [globe, points]);

  function handleClick(e: ThreeEvent<MouseEvent>) {
    // three-globe stores the datum on the custom beacon group.
    let obj: THREE.Object3D | null = e.object;
    while (obj) {
      const data = (obj as unknown as { __data?: GlobeStatPoint }).__data;
      if (data?.key) {
        e.stopPropagation();
        onPointClick(data);
        return;
      }
      obj = obj.parent;
    }
  }

  return <primitive object={globe} onClick={handleClick} />;
}

export default function GlobeScene({
  points,
  onPointClick,
}: {
  points: GlobeStatPoint[];
  onPointClick: (point: GlobeStatPoint) => void;
}) {
  const [motion, setMotion] = useState({ reduced: false, lowPower: false });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const device = navigator as Navigator & { deviceMemory?: number };
      setMotion({
        reduced: media.matches,
        lowPower:
          window.innerWidth < 700 ||
          (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) ||
          (device.deviceMemory !== undefined && device.deviceMemory <= 4),
      });
    };
    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 40, 300], fov: 50 }}
      dpr={motion.lowPower ? 1 : [1, 1.5]}
      frameloop={motion.reduced ? "demand" : "always"}
      gl={{ antialias: !motion.lowPower, powerPreference: motion.lowPower ? "low-power" : "high-performance" }}
      // `globe-canvas` (globals.css) forces touch-action:pan-y with !important —
      // r3f sets inline `touch-action:auto`, which OrbitControls then cancels via
      // preventDefault, so on a phone the full-screen globe traps every vertical
      // drag and you can't scroll off the hero. pan-y hands vertical swipes back
      // to the browser; horizontal drags still spin the globe, taps still work.
      className="globe-canvas !absolute inset-0"
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[200, 120, 180]} intensity={1.1} color="#f0e6ff" />
      <group rotation={[0.12, 0, -0.08]}>
        <GlobeObject points={points} onPointClick={onPointClick} />
      </group>
      {!motion.reduced && (
        <Stars
          radius={280}
          depth={70}
          count={motion.lowPower ? 650 : 1500}
          factor={motion.lowPower ? 3 : 4}
          saturation={0}
          fade
          speed={0.35}
        />
      )}
      <OrbitControls
        autoRotate={!motion.reduced}
        autoRotateSpeed={0.55}
        enablePan={false}
        // Zoom OFF: OrbitControls' wheel handler calls preventDefault, which on a
        // desktop traps the mouse wheel over the full-screen canvas and the page
        // won't scroll. Disabling it hands the wheel back to the page; the globe
        // is drag-to-spin only. (Touch scroll is handled by touch-action:pan-y.)
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
