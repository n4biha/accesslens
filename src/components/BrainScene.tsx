"use client";

import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type { BufferGeometry, Group, Matrix4, Mesh } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const MODEL_PATH = "/models/brain-mri.glb";
const MIN_POLAR_ANGLE = 0.72;
const MAX_POLAR_ANGLE = 2.42;
const ROTATION_STEP = Math.PI / 12;
const TILT_STEP = Math.PI / 18;
const NEURAL_NODES: [number, number, number, number][] = [
  [-0.94, 0.53, 0.91, 0.024], [-0.55, 0.69, 1.02, 0.021], [0.2, 0.75, 0.92, 0.025],
  [0.86, 0.72, 0.72, 0.018], [-0.4, -0.7, 0.79, 0.021], [0.02, -0.72, 0.92, 0.024],
  [0.58, -0.58, 0.88, 0.019], [-0.3, 0.02, 1.23, 0.026], [0.62, 0.2, 1.08, 0.022],
  [-1.2, 0.52, 0.7, 0.015], [-0.72, 0.78, 0.83, 0.017], [-0.02, 0.86, 0.78, 0.015],
  [0.72, 0.83, 0.67, 0.018], [1.23, -0.08, 0.73, 0.015], [-0.78, -0.74, 0.7, 0.016],
  [0.36, -0.8, 0.76, 0.017], [0.99, -0.62, 0.7, 0.014],
];
const AMBIENT_POINTS: [number, number, number, number][] = [
  [-1.92, 0.82, 0.15, 0.015], [-1.7, -0.72, 0.62, 0.021], [-1.42, 1.12, -0.35, 0.012],
  [-1.18, -1.02, -0.2, 0.014], [-0.65, 1.43, 0.18, 0.017], [-0.22, -1.28, 0.52, 0.011],
  [0.38, 1.38, -0.25, 0.013], [0.82, -1.08, 0.45, 0.019], [1.22, 1.04, 0.32, 0.014],
  [1.5, -0.64, -0.28, 0.012], [1.82, 0.54, 0.22, 0.022], [1.96, -0.04, -0.4, 0.011],
  [-1.55, 0.18, 0.82, 0.009], [-1.34, 0.92, 0.43, 0.012], [-1.04, -0.88, 0.75, 0.01],
  [-0.52, 1.18, 0.72, 0.008], [-0.14, -1.06, 0.9, 0.011], [0.42, 1.18, 0.75, 0.01],
  [0.92, -0.92, 0.72, 0.008], [1.28, 0.82, 0.62, 0.012], [1.48, -0.24, 0.8, 0.009],
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV === "development") {
      console.error("AccessLens 3D brain failed to render", error, info);
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function NeuralDetails() {
  return (
    <group renderOrder={3}>
      {NEURAL_NODES.map(([x, y, z, radius], index) => (
        <mesh key={index} position={[x, y, z]}>
          <sphereGeometry args={[radius, 12, 12]} />
          <meshBasicMaterial color="#ffe7da" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function SurroundingDetails() {
  return (
    <group>
      {AMBIENT_POINTS.map(([x, y, z, radius], index) => (
        <mesh key={index} position={[x, y, z]}>
          <sphereGeometry args={[radius, 10, 10]} />
          <meshBasicMaterial
            color={index % 3 === 0 ? "#bd6870" : "#ffe9dc"}
            transparent
            opacity={index % 3 === 0 ? 0.65 : 0.85}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function BrainModel({
  reducedMotion,
  interacting,
  onReady,
}: {
  reducedMotion: boolean;
  interacting: boolean;
  onReady: () => void;
}) {
  const rig = useRef<Group>(null);
  const { scene } = useGLTF(MODEL_PATH, false, true);
  const brainMesh = useMemo(() => {
    const meshes: Mesh[] = [];

    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      const candidate = object as Mesh;
      if (candidate.isMesh) meshes.push(candidate);
    });

    const source = meshes[0];
    if (!source) throw new Error("The anatomical brain model contains no mesh geometry.");

    // Meshopt quantization stores the anatomical dimensions on the glTF node.
    // Keep that transform separate: baking it into normalized integer vertices
    // would clamp the model back to a two-unit cube.
    return {
      geometry: source.geometry as BufferGeometry,
      matrix: source.matrixWorld.clone() as Matrix4,
    };
  }, [scene]);

  useEffect(onReady, [onReady]);

  useFrame((state, delta) => {
    if (!rig.current || reducedMotion || interacting) return;

    const targetY = 0.12 + Math.sin(state.clock.elapsedTime * 0.44) * 0.026;
    rig.current.position.y += (targetY - rig.current.position.y) * Math.min(1, delta * 1.8);
  });

  return (
    <group ref={rig} position={[0, 0.12, 0]}>
      <group scale={0.018} rotation={[-Math.PI / 2, 0, -0.12]}>
        <mesh
          geometry={brainMesh.geometry}
          matrix={brainMesh.matrix}
          matrixAutoUpdate={false}
          castShadow
          receiveShadow
        >
          <meshPhysicalMaterial
            color="#e2aaa6"
            roughness={0.2}
            metalness={0}
            transmission={0.19}
            thickness={0.76}
            ior={1.44}
            clearcoat={1}
            clearcoatRoughness={0.09}
            specularIntensity={0.9}
            specularColor="#fff1eb"
            sheen={0.5}
            sheenRoughness={0.36}
            sheenColor="#fbc5c1"
            attenuationColor="#c4777a"
            attenuationDistance={2.35}
          />
        </mesh>
      </group>
      <NeuralDetails />
    </group>
  );
}

function Scene({
  controlsRef,
  reducedMotion,
  interacting,
  onReady,
  onInteractionStart,
  onInteractionEnd,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  reducedMotion: boolean;
  interacting: boolean;
  onReady: () => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
}) {
  return (
    <>
      <ambientLight intensity={0.84} />
      <hemisphereLight args={["#fffaf5", "#c68a89", 1.26]} />
      <directionalLight position={[-4.5, 5, 4]} intensity={3.2} color="#fff2e9" />
      <directionalLight position={[4, 2, -3]} intensity={2.2} color="#e78491" />
      <pointLight position={[-2.8, 0.5, 3.8]} intensity={7} color="#ffe1d8" />

      <Environment resolution={128} frames={1} environmentIntensity={0.66}>
        <Lightformer
          form="rect"
          intensity={2.2}
          color="#fff7f0"
          position={[-3, 3, 4]}
          scale={[4.5, 2.2]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.4}
          color="#f4a9b2"
          position={[4, 1, -3]}
          scale={[3, 4]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="ring"
          intensity={1.15}
          color="#ffe4dc"
          position={[0, -2, 2]}
          scale={2.5}
          target={[0, 0, 0]}
        />
      </Environment>

      <Suspense fallback={null}>
        <BrainModel
          reducedMotion={reducedMotion}
          interacting={interacting}
          onReady={onReady}
        />
      </Suspense>

      <SurroundingDetails />

      <mesh position={[0, -1.34, 0]} receiveShadow>
        <cylinderGeometry args={[1.58, 1.68, 0.18, 72]} />
        <meshPhysicalMaterial color="#f5e2dc" roughness={0.7} clearcoat={0.24} />
      </mesh>
      <mesh position={[0, -1.225, 0]} receiveShadow>
        <cylinderGeometry args={[1.36, 1.42, 0.08, 72]} />
        <meshPhysicalMaterial color="#fff4ef" roughness={0.34} clearcoat={0.66} clearcoatRoughness={0.2} />
      </mesh>
      <mesh position={[0, -1.176, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.18, 0.017, 12, 96]} />
        <meshStandardMaterial color="#df8c91" roughness={0.32} emissive="#b94f60" emissiveIntensity={0.08} />
      </mesh>
      <ContactShadows
        position={[0, -1.22, 0]}
        opacity={0.18}
        scale={4.2}
        blur={3.2}
        far={3.2}
        resolution={256}
        frames={1}
        color="#916c68"
      />

      <OrbitControls
        ref={controlsRef}
        target={[0, 0.05, 0]}
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.54}
        minPolarAngle={MIN_POLAR_ANGLE}
        maxPolarAngle={MAX_POLAR_ANGLE}
        autoRotate={!reducedMotion && !interacting}
        autoRotateSpeed={0.24}
        onStart={onInteractionStart}
        onEnd={onInteractionEnd}
      />
    </>
  );
}

useGLTF.preload(MODEL_PATH, false, true);

export default function BrainScene() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const resumeTimer = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [webglAvailable] = useState(supportsWebGL);
  const reducedMotion = useReducedMotion();
  const handleModelReady = useCallback(() => setReady(true), []);

  const pauseIdleRotation = useCallback(() => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    setInteracting(true);
  }, []);

  const resumeIdleRotationLater = useCallback(() => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setInteracting(false), 3000);
  }, []);

  useEffect(
    () => () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    },
    [],
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const controls = controlsRef.current;
    if (!controls) return;

    const polar = controls.getPolarAngle();
    const azimuth = controls.getAzimuthalAngle();
    let handled = true;

    switch (event.key) {
      case "ArrowLeft":
        controls.setAzimuthalAngle(azimuth - ROTATION_STEP);
        break;
      case "ArrowRight":
        controls.setAzimuthalAngle(azimuth + ROTATION_STEP);
        break;
      case "ArrowUp":
        controls.setPolarAngle(Math.max(MIN_POLAR_ANGLE, polar - TILT_STEP));
        break;
      case "ArrowDown":
        controls.setPolarAngle(Math.min(MAX_POLAR_ANGLE, polar + TILT_STEP));
        break;
      case "r":
      case "R":
        controls.reset();
        break;
      default:
        handled = false;
    }

    if (!handled) return;
    event.preventDefault();
    controls.update();
    pauseIdleRotation();
    resumeIdleRotationLater();
  }

  return (
    <div
      className={`brain-canvas-frame ${ready ? "is-ready" : ""}`}
      role="group"
      aria-label="Interactive 3D anatomical brain. Drag or swipe to rotate. Use the arrow keys to rotate and R to reset."
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="brain-static-fallback" aria-hidden="true" />
      <div className="brain-scene-aura" aria-hidden="true" />
      {webglAvailable ? (
        <SceneErrorBoundary>
          <Canvas
            camera={{ position: [0, 0.18, 5.1], fov: 38 }}
            dpr={[1, 1.35]}
            gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          >
            <Scene
              controlsRef={controlsRef}
              reducedMotion={reducedMotion}
              interacting={interacting}
              onReady={handleModelReady}
              onInteractionStart={pauseIdleRotation}
              onInteractionEnd={resumeIdleRotationLater}
            />
          </Canvas>
        </SceneErrorBoundary>
      ) : null}
      <span className="brain-control-hint" aria-hidden="true">
        Drag to rotate · Arrow keys · R to reset
      </span>
    </div>
  );
}
