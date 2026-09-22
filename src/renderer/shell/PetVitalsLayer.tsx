import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatPetVitalsEffects,
  type PetVitalsActionId,
  type PetVitalsSnapshot,
  type PetVitalsStatusAnchor,
  type PetVitalsStatusPlacement,
} from "../../shared/petVitals";
import { PetVitalsPanel, type PetVitalsToast } from "../components/PetVitalsPanel";
import "./PetVitals.css";

const toastDurationMs = 2400;
const disconnectedMessage = "养成服务未连接";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PetVitalsLayer() {
  const [expanded, setExpanded] = useState(() => new URLSearchParams(window.location.search).get("expanded") === "1");
  const [placement, setPlacement] = useState<PetVitalsStatusPlacement>("right");
  const [anchor, setAnchor] = useState<PetVitalsStatusAnchor>(
    () => (new URLSearchParams(window.location.search).get("anchor") === "custom" ? "custom" : "auto"),
  );
  const [tailOffset, setTailOffset] = useState(46);
  const [snapshot, setSnapshot] = useState<PetVitalsSnapshot | undefined>();
  const [petName, setPetName] = useState<string | undefined>();
  const [busyAction, setBusyAction] = useState<PetVitalsActionId | undefined>();
  const [toast, setToast] = useState<PetVitalsToast | undefined>();
  const [loading, setLoading] = useState(true);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const draggingRef = useRef(false);

  const showToast = useCallback((text: string, tone: PetVitalsToast["tone"]) => {
    setToast({ id: Date.now(), text, tone });
    if (toastTimerRef.current !== undefined) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => setToast(undefined), toastDurationMs);
  }, []);

  useEffect(() => {
    const vitals = window.petdex?.pet?.vitals;
    if (!vitals) {
      setLoading(false);
      return;
    }

    let active = true;
    void vitals.get()
      .then((next) => {
        if (active) {
          setSnapshot(next);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));

    const offChanged = vitals.onChanged((next) => {
      setSnapshot(next);
      setLoading(false);
    });
    const offLayout = vitals.onStatusLayout((state) => {
      setExpanded(state.expanded);
      setPlacement(state.placement);
      setAnchor(state.anchor);
      setTailOffset(state.tailOffset ?? 46);
    });
    void vitals.getStatus?.()
      .then((state) => {
        if (active) {
          setExpanded(state.expanded);
          setPlacement(state.placement);
          setAnchor(state.anchor);
          setTailOffset(state.tailOffset ?? 46);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      offChanged();
      offLayout();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve(window.petdex?.pet?.getCurrentSkin?.())
      .then((result) => {
        if (active && result?.skin?.manifest?.displayName) {
          setPetName(result.skin.manifest.displayName);
        }
      })
      .catch(() => undefined);

    const offSkinChanged = window.petdex?.pet?.onSkinChanged?.((result) => {
      if (result?.skin?.manifest?.displayName) {
        setPetName(result.skin.manifest.displayName);
      }
    });

    return () => {
      active = false;
      offSkinChanged?.();
    };
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current !== undefined) {
      window.clearTimeout(toastTimerRef.current);
    }
  }, []);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    void Promise.resolve(window.petdex?.pet?.vitals?.setStatusExpanded(next)).catch(() => undefined);
  }

  async function runAction(action: PetVitalsActionId) {
    const vitals = window.petdex?.pet?.vitals;
    if (!vitals) {
      showToast(disconnectedMessage, "warn");
      return;
    }

    setBusyAction(action);
    try {
      const result = await vitals.applyAction(action);
      setSnapshot(result.snapshot);
      showToast(result.ok ? formatPetVitalsEffects(result.effects) : result.message, result.ok ? "gain" : "warn");
    } catch (error) {
      showToast(getErrorMessage(error, "照顾宠物失败"), "warn");
    } finally {
      setBusyAction(undefined);
    }
  }

  function openSettings() {
    void Promise.resolve(window.petdex?.plugins.invokeAction("settings.open")).catch(() => undefined);
  }

  function moveBy(deltaX: number, deltaY: number) {
    draggingRef.current = true;
    // While the pointer is down the main process only moves the window; the
    // final position is pinned once the drag ends.
    void Promise.resolve(window.petdex?.pet?.vitals?.moveStatusBy(deltaX, deltaY))
      .then((state) => {
        if (state) {
          setAnchor(state.anchor);
          setPlacement(state.placement);
          setTailOffset(state.tailOffset ?? 46);
        }
      })
      .catch(() => undefined);
  }

  function endDrag() {
    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = false;
    void Promise.resolve(window.petdex?.pet?.vitals?.setStatusAnchor("custom"))
      .then((state) => {
        if (state) {
          setAnchor(state.anchor);
        }
      })
      .catch(() => undefined);
  }

  function followPet() {
    draggingRef.current = false;
    setAnchor("auto");
    void Promise.resolve(window.petdex?.pet?.vitals?.setStatusAnchor("auto"))
      .then((state) => {
        if (state) {
          setAnchor(state.anchor);
          setPlacement(state.placement);
          setTailOffset(state.tailOffset ?? 46);
        }
      })
      .catch(() => undefined);
  }

  return (
    <main className="pv-layer" data-expanded={expanded ? "true" : "false"} data-anchor={anchor}>
      <PetVitalsPanel
        snapshot={snapshot}
        expanded={expanded}
        placement={placement}
        anchor={anchor}
        tailOffset={tailOffset}
        petName={petName}
        busyAction={busyAction}
        toast={toast}
        loading={loading}
        onToggle={toggleExpanded}
        onAction={runAction}
        onOpenSettings={openSettings}
        onMoveBy={moveBy}
        onDragEnd={endDrag}
        onFollowPet={followPet}
      />
    </main>
  );
}