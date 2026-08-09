"use client";

import {
  ContactShadows,
  Environment,
  Instance,
  Instances,
  Lightformer,
  OrbitControls,
  Preload,
  useGLTF,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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
    <Instances limit={NEURAL_NODES.length} renderOrder={3}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial color="#ffe7da" toneMapped={false} />
      {NEURAL_NODES.map(([x, y, z, radius], index) => (
        <Instance key={index} position={[x, y, z]} scale={radius} />
      ))}
    </Instances>
  );
}

function SurroundingDetails() {
  return (
    <Instances limit={AMBIENT_POINTS.length}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial transparent opacity={0.72} toneMapped={false} />
      {AMBIENT_POINTS.map(([x, y, z, radius], index) => (
        <Instance
          key={index}
          position={[x, y, z]}
          scale={radius}
          color={index % 3 === 0 ? "#bd6870" : "#ffe9dc"}
        />
      ))}
    </Instances>
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
  const renderedFrames = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
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

  const handleRenderedFrame = useCallback(() => {
    if (renderedFrames.current === 0) {
      renderedFrames.current = 1;
      invalidate();
      return;
    }

    if (renderedFrames.current === 1) {
      renderedFrames.current = 2;
      onReady();
    }
  }, [invalidate, onReady]);

  useFrame((state, delta) => {
    if (!rig.current || reducedMotion || interacting) return;

    const targetY = 0.12 + Math.sin(state.clock.elapsedTime * 0.44) * 0.026;
    rig.current.position.y += (targetY - rig.current.position.y) * Math.min(1, delta * 1.8);
  });

  return (
    <group ref={rig} position={[0, 0.14, 0]}>
      <group scale={0.018} rotation={[-Math.PI / 2, 0, -0.12]}>
        <mesh
          geometry={brainMesh.geometry}
          matrix={brainMesh.matrix}
          matrixAutoUpdate={false}
          castShadow
          receiveShadow
          onAfterRender={handleRenderedFrame}
        >
          <meshPhysicalMaterial
            color="#d5afab"
            roughness={0.155}
            metalness={0}
            transmission={0}
            clearcoat={1}
            clearcoatRoughness={0.035}
            specularIntensity={1}
            specularColor="#fffaf5"
            sheen={0.08}
            sheenRoughness={0.38}
            sheenColor="#e8bbb8"
            envMapIntensity={1.08}
            flatShading={false}
          />
        </mesh>
      </group>
      <NeuralDetails />
    </group>
  );
}

function Scene({
  controlsRef,
  interactive,
  reducedMotion,
  interacting,
  onReady,
  onInteractionStart,
  onInteractionEnd,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  interactive: boolean;
  reducedMotion: boolean;
  interacting: boolean;
  onReady: () => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
}) {
  return (
    <>
      <ambientLight intensity={0.27} />
      <hemisphereLight args={["#fff8f1", "#57293a", 0.56]} />
      <directionalLight position={[-4.8, 5.8, 4.8]} intensity={4.25} color="#fff7f1" />
      <directionalLight position={[4.8, 2.6, -4]} intensity={1.9} color="#bd6078" />
      <pointLight position={[-2.8, 0.8, 4.4]} intensity={5.2} color="#ffece4" />
      <pointLight position={[2.8, -0.3, 3]} intensity={1.55} color="#c35d74" />

      <Environment resolution={128} frames={1} environmentIntensity={0.78}>
        <Lightformer
          form="rect"
          intensity={3.65}
          color="#fff7f0"
          position={[-3.2, 3.6, 4.5]}
          scale={[5.5, 1.35]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.35}
          color="#d98393"
          position={[4, 1, -3]}
          scale={[3, 4]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.65}
          color="#ffe4dc"
          position={[0, -2.2, 3.4]}
          scale={[3.8, 1.2]}
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
        <meshPhysicalMaterial color="#24171d" roughness={0.5} clearcoat={0.46} clearcoatRoughness={0.28} />
      </mesh>
      <mesh position={[0, -1.225, 0]} receiveShadow>
        <cylinderGeometry args={[1.36, 1.42, 0.08, 72]} />
        <meshPhysicalMaterial
          color="#3a242c"
          roughness={0.27}
          transmission={0.08}
          clearcoat={0.78}
          clearcoatRoughness={0.16}
        />
      </mesh>
      <mesh position={[0, -1.176, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.18, 0.017, 12, 96]} />
        <meshStandardMaterial color="#ee8197" roughness={0.28} emissive="#c9325c" emissiveIntensity={0.34} />
      </mesh>
      <ContactShadows
        position={[0, -1.22, 0]}
        opacity={0.18}
        scale={4.2}
        blur={3.2}
        far={3.2}
        resolution={256}
        frames={1}
        color="#090509"
      />

      <OrbitControls
        ref={controlsRef}
        enabled={interactive}
        target={[0, 0.08, 0]}
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.065}
        rotateSpeed={0.38}
        minPolarAngle={MIN_POLAR_ANGLE}
        maxPolarAngle={MAX_POLAR_ANGLE}
        autoRotate={interactive && !reducedMotion && !interacting}
        autoRotateSpeed={0.12}
        onStart={onInteractionStart}
        onEnd={onInteractionEnd}
      />
    </>
  );
}

useGLTF.preload(MODEL_PATH, false, true);

export default function BrainScene({
  interactive,
  onReady,
}: {
  interactive: boolean;
  onReady: () => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const resumeTimer = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [webglAvailable] = useState(supportsWebGL);
  const reducedMotion = useReducedMotion();
  const handleModelReady = useCallback(() => {
    setReady(true);
    onReady();
  }, [onReady]);

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
    if (!interactive) return;
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
      className={`brain-canvas-frame ${ready ? "is-ready" : ""} ${interactive ? "is-interactive" : ""}`}
      role={interactive ? "group" : undefined}
      aria-label={interactive ? "Interactive 3D anatomical brain. Drag or swipe to rotate. Use the arrow keys to rotate and R to reset." : undefined}
      aria-hidden={!interactive}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={handleKeyDown}
    >
      <div className="brain-static-fallback" aria-hidden="true" />
      <div className="brain-scene-aura" aria-hidden="true" />
      {webglAvailable ? (
        <SceneErrorBoundary>
          <Canvas
            camera={{ position: [0, 0.18, 5.2], fov: 37 }}
            dpr={[1.2, 1.75]}
            frameloop={interactive && !reducedMotion ? "always" : "demand"}
            gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
            onCreated={({ gl }) => {
              gl.toneMappingExposure = 1.08;
            }}
          >
            <Scene
              controlsRef={controlsRef}
              interactive={interactive}
              reducedMotion={reducedMotion}
              interacting={!interactive || interacting}
              onReady={handleModelReady}
              onInteractionStart={pauseIdleRotation}
              onInteractionEnd={resumeIdleRotationLater}
            />
            <Preload all />
          </Canvas>
        </SceneErrorBoundary>
      ) : null}
      {interactive && (
        <span className="brain-control-hint" aria-hidden="true">
          Drag to rotate · Arrow keys · R to reset
        </span>
      )}
    </div>
  );
}
