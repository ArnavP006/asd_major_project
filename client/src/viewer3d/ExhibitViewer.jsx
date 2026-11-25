import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Canvas, useFrame } from '@react-three/fiber';
import { Center, OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import ModelErrorBoundary from './ModelErrorBoundary';

function Model({ url }) {
  const { scene, animations } = useGLTF(url);
  // Play the first animation clip when the model has one (e.g. the rigged T-Rex).
  const mixer = useMemo(
    () => (animations?.length ? new THREE.AnimationMixer(scene) : null),
    [scene, animations],
  );
  const actionRef = useRef(null);

  useEffect(() => {
    if (!mixer || !animations?.length) return undefined;
    const action = mixer.clipAction(animations[0]);
    action.reset().play();
    actionRef.current = action;
    return () => action.stop();
  }, [mixer, animations]);

  useFrame((_, delta) => {
    if (mixer) mixer.update(delta);
  });

  // Normalise any model to about 1.8 units so the fixed camera frames it fully.
  const scaled = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    scene.scale.setScalar(1.8 / maxDim);
    return scene;
  }, [scene]);
  return <primitive object={scaled} />;
}

/** Rendered inside the Canvas only after the model resolved, so loading can end reliably. */
function ReadySignal({ onReady }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

function LoadingOverlay({ loaded, timedOut, failed }) {
  const { t } = useTranslation();
  const { progress } = useProgress();

  if (loaded || failed) return null;
  if (timedOut) {
    return (
      <div className="viewer3d__status" role="alert">
        {t('chat.viewer.error')}
      </div>
    );
  }

  return (
    <div className="viewer3d__status" aria-live="polite">
      <span>{t('chat.viewer.loading')}</span>
      <span className="viewer3d__progress">{Math.round(progress)}%</span>
    </div>
  );
}

function ErrorFallback({ onClose }) {
  const { t } = useTranslation();
  return (
    <div className="viewer3d__status" role="alert">
      <span>{t('chat.viewer.error')}</span>
      <button type="button" className="chip" onClick={onClose}>
        {t('chat.viewer.close')}
      </button>
    </div>
  );
}

/**
 * Full-screen 3D exhibit preview (FR-V1..FR-V3, FR-V5, FR-V6, FR-V9, FR-V11).
 * Self-contained: the chat only supplies the model list, a title and onClose.
 * When an exhibition has several models, ‹ › switches between them.
 */
export default function ExhibitViewer({ items, title, onClose }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [failed, setFailed] = useState(false);

  const current = items[index] ?? items[0];

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && items.length > 1) switchTo((index - 1 + items.length) % items.length);
      if (event.key === 'ArrowRight' && items.length > 1) switchTo((index + 1) % items.length);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Release the cached models; the WebGL context goes with the unmounted Canvas.
      items.forEach((item) => useGLTF.clear(item.url));
    };
  }, [items, index, onClose]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, []);

  function switchTo(next) {
    setIndex(next);
    setLoaded(false);
    setFailed(false);
    setInteracted(false);
  }

  return (
    <div className="viewer3d" role="dialog" aria-modal="true" aria-label={title}>
      <header className="viewer3d__head">
        <div className="viewer3d__titles">
          <strong className="viewer3d__title">{title}</strong>
          {items.length > 1 ? (
            <div className="viewer3d__switcher">
              <button
                type="button"
                className="chip viewer3d__arrow"
                onClick={() => switchTo((index - 1 + items.length) % items.length)}
                aria-label="Previous model"
              >
                ‹
              </button>
              <span className="viewer3d__model-name">{current.name}</span>
              <button
                type="button"
                className="chip viewer3d__arrow"
                onClick={() => switchTo((index + 1) % items.length)}
                aria-label="Next model"
              >
                ›
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" className="chip viewer3d__close" onClick={onClose} autoFocus>
          {t('chat.viewer.close')}
        </button>
      </header>

      <ModelErrorBoundary
        key={current.url}
        onError={() => setFailed(true)}
        fallback={<ErrorFallback onClose={onClose} />}
      >
        <Canvas className="viewer3d__canvas" dpr={[1, 2]} camera={{ position: [0, 1, 3], fov: 45 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[3, 5, 2]} intensity={1.2} />
          <Suspense fallback={null}>
            <Center>
              <Model url={current.url} />
            </Center>
            <ReadySignal onReady={() => setLoaded(true)} />
          </Suspense>
          <OrbitControls
            enablePan={false}
            minDistance={1.5}
            maxDistance={6}
            autoRotate={!interacted}
            autoRotateSpeed={1.2}
            onStart={() => setInteracted(true)}
          />
        </Canvas>
      </ModelErrorBoundary>

      <p className="viewer3d__hint">{t('chat.viewer.hint')}</p>
      {current.credit ? <p className="viewer3d__credit">{current.credit}</p> : null}
      <LoadingOverlay loaded={loaded} timedOut={timedOut} failed={failed} />
    </div>
  );
}
