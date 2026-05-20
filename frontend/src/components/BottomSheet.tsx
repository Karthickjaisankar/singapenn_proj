import { useRef, useState, useEffect, ReactNode } from "react";

export type SnapPoint = "peek" | "half" | "full";

interface BottomSheetProps {
  snap: SnapPoint;
  onSnapChange?: (snap: SnapPoint) => void;
  children: ReactNode;
  /** Extra class names applied to the sheet panel */
  className?: string;
  /** Background color of the sheet. Defaults to white. */
  dark?: boolean;
}

const PEEK_HEIGHT = 140;
const VELOCITY_THRESHOLD = 400; // px/s — flick gesture threshold

export default function BottomSheet({
  snap,
  onSnapChange,
  children,
  className = "",
  dark = false,
}: BottomSheetProps) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0); // extra translateY during drag

  const startY = useRef(0);
  const startTime = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Snap points as bottom offsets from viewport bottom (how much sheet is visible)
  function snapToTranslate(s: SnapPoint): number {
    const vh = window.innerHeight;
    if (s === "peek") return vh - PEEK_HEIGHT;
    if (s === "half") return vh * 0.5;
    return vh * 0.1; // full = 90vh visible
  }

  const translateY = dragging
    ? snapToTranslate(snap) + offset
    : snapToTranslate(snap);

  function onTouchStart(e: React.TouchEvent) {
    setDragging(true);
    startY.current = e.touches[0].clientY;
    startTime.current = Date.now();
    setOffset(0);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging) return;
    const delta = e.touches[0].clientY - startY.current;
    setOffset(delta);
  }

  function onTouchEnd(e: React.TouchEvent) {
    setDragging(false);
    const delta = e.changedTouches[0].clientY - startY.current;
    const elapsed = (Date.now() - startTime.current) / 1000;
    const velocity = delta / elapsed; // px/s, positive = downward

    let next: SnapPoint = snap;

    if (velocity > VELOCITY_THRESHOLD) {
      // Fast flick downward
      next = snap === "full" ? "half" : "peek";
    } else if (velocity < -VELOCITY_THRESHOLD) {
      // Fast flick upward
      next = snap === "peek" ? "half" : "full";
    } else {
      // Slow drag — choose nearest snap based on resulting position
      const resultY = snapToTranslate(snap) + delta;
      const vh = window.innerHeight;
      const peeked = vh - PEEK_HEIGHT;
      const half = vh * 0.5;
      const full = vh * 0.1;

      const dist = (target: number) => Math.abs(resultY - target);
      const nearest = Math.min(dist(peeked), dist(half), dist(full));
      if (nearest === dist(peeked)) next = "peek";
      else if (nearest === dist(half)) next = "half";
      else next = "full";
    }

    setOffset(0);
    if (next !== snap) onSnapChange?.(next);
  }

  // Prevent body scroll when sheet is open at half/full
  useEffect(() => {
    if (snap !== "peek") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [snap]);

  const bg = dark ? "bg-surface-L1" : "bg-white";
  const borderTop = dark ? "border-border" : "border-ink-200";

  return (
    <div
      ref={sheetRef}
      className={`fixed left-0 right-0 bottom-0 z-30 rounded-t-2xl border-t shadow-2xl
                  ${bg} ${borderTop} ${className}
                  ${dragging ? "" : "transition-transform duration-300 ease-out"}`}
      style={{ transform: `translateY(${translateY}px)`, height: "95vh" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
        <div className={`w-10 h-1 rounded-full ${dark ? "bg-border-strong" : "bg-ink-300"}`} />
      </div>

      {/* Scrollable content — only scrollable when at half or full */}
      <div
        className="overflow-y-auto pb-safe"
        style={{ height: "calc(95vh - 24px)" }}
        onTouchStart={(e) => {
          // Allow sheet drag only when touch starts on handle; let content scroll otherwise
          e.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}
