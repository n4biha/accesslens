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
            color="#f0bcb6"
            roughness={0.3}
            metalness={0}
            transmission={0.035}
            thickness={0.42}
            ior={1.4}
            clearcoat={0.9}
            clearcoatRoughness={0.18}
            specularIntensity={0.72}
            specularColor="#fff7f2"
            sheen={0.48}
            sheenRoughness={0.46}
            sheenColor="#ffd9d3"
          />
        </mesh>
      </group>
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
      <ambientLight intensity={0.9} />
      <hemisphereLight args={["#fffaf5", "#d7a7a2", 1.35]} />
      <directionalLight position={[-4.5, 5, 4]} intensity={3.2} color="#fff2e9" />
      <directionalLight position={[4, 2, -3]} intensity={2.1} color="#ef92a1" />
      <pointLight position={[-2.8, 0.5, 3.8]} intensity={7} color="#ffe1d8" />

      <Environment resolution={128} frames={1} environmentIntensity={0.62}>
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

      <mesh position={[0, -1.3, 0]} receiveShadow>
        <cylinderGeometry args={[1.5, 1.62, 0.12, 72]} />
        <meshPhysicalMaterial color="#f8e8e3" roughness={0.67} clearcoat={0.22} />
      </mesh>
      <mesh position={[0, -1.225, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.018, 12, 96]} />
        <meshStandardMaterial color="#d77f8c" roughness={0.42} emissive="#9f4355" emissiveIntensity={0.06} />
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
