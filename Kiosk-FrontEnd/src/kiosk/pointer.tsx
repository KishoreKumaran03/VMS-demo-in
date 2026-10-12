import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type PointerContextValue = {
  isTouch: boolean;
  reducedMotion: boolean;
  lowPower: boolean;
  isPointerActive: boolean;
};

const PointerContext = createContext<PointerContextValue>({
  isTouch: false,
  reducedMotion: false,
  lowPower: false,
  isPointerActive: false,
});

export function PointerProvider({ children }: { children: ReactNode }) {
  const [isTouch, setIsTouch] = useState(false);
  const [isPointerActive, setIsPointerActive] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lowPower, setLowPower] = useState(false);

  const rafId = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPos = useRef<{ x: number; y: number } | null>(null);

  // Check hardware and accessibility preferences
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const handleMotionChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", handleMotionChange);

    const cores = navigator.hardwareConcurrency ?? 4;
    if (cores <= 2) {
      setLowPower(true);
    }

    return () => {
      mql.removeEventListener("change", handleMotionChange);
    };
  }, []);

  // Single pointermove & touch ripple listener
  useEffect(() => {
    if (typeof window === "undefined" || reducedMotion) return;

    const root = document.documentElement;

    const updateCssVars = () => {
      if (!latestPos.current) return;
      root.style.setProperty("--px", `${latestPos.current.x}px`);
      root.style.setProperty("--py", `${latestPos.current.y}px`);
      rafId.current = null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const isTouchType = e.pointerType === "touch";
      setIsTouch(isTouchType);
      setIsPointerActive(true);
      root.setAttribute("data-pointer-active", "true");

      latestPos.current = { x: e.clientX, y: e.clientY };
      if (!rafId.current) {
        rafId.current = requestAnimationFrame(updateCssVars);
      }

      if (idleTimer.current) clearTimeout(idleTimer.current);
      // Hide spotlight after 5 seconds of no pointer movement
      idleTimer.current = setTimeout(() => {
        setIsPointerActive(false);
        root.setAttribute("data-pointer-active", "false");
      }, 5000);
    };

    // Touch ripple effect on pointerdown
    const onPointerDown = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest(
        "button, [role='button'], .pressable",
      ) as HTMLElement | null;
      if (!target || reducedMotion) return;

      const rect = target.getBoundingClientRect();
      const ripple = document.createElement("span");
      const diameter = Math.max(rect.width, rect.height) * 1.5;
      const radius = diameter / 2;
      const x = e.clientX - rect.left - radius;
      const y = e.clientY - rect.top - radius;

      ripple.style.position = "absolute";
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      ripple.style.width = `${diameter}px`;
      ripple.style.height = `${diameter}px`;
      ripple.style.borderRadius = "9999px";
      ripple.style.pointerEvents = "none";
      ripple.style.transform = "scale(0)";
      ripple.style.opacity = "0.35";
      ripple.style.backgroundColor = target.classList.contains("bg-gradient-primary")
        ? "rgba(255, 255, 255, 0.4)"
        : "rgba(43, 79, 216, 0.25)";
      ripple.style.transition =
        "transform 450ms cubic-bezier(0.2, 0.8, 0.4, 1), opacity 450ms ease-out";
      ripple.style.zIndex = "10";

      // Ensure target position relative if static
      const prevPos = window.getComputedStyle(target).position;
      if (prevPos === "static") {
        target.style.position = "relative";
      }
      const prevOverflow = window.getComputedStyle(target).overflow;
      if (prevOverflow === "visible") {
        target.style.overflow = "hidden";
      }

      target.appendChild(ripple);

      requestAnimationFrame(() => {
        ripple.style.transform = "scale(1)";
        ripple.style.opacity = "0";
      });

      setTimeout(() => {
        ripple.remove();
      }, 460);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      if (rafId.current) cancelAnimationFrame(rafId.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [reducedMotion]);

  return (
    <PointerContext.Provider value={{ isTouch, reducedMotion, lowPower, isPointerActive }}>
      {children}
      {/* Decorative Page Spotlight: 420px soft radial light */}
      {!reducedMotion && !lowPower && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-700 ease-out"
          style={{
            opacity: isPointerActive ? 1 : 0,
            background:
              "radial-gradient(420px circle at var(--px, -1000px) var(--py, -1000px), oklch(0.5 0.2 266 / 8%), transparent 80%)",
          }}
        />
      )}
    </PointerContext.Provider>
  );
}

export function usePointerGlow() {
  return useContext(PointerContext);
}

/**
 * Hook for card spotlight and 3D tilt (up to 3deg).
 * Disabled on touch, reduced-motion, and low-power devices.
 */
export function useCardSpotlightTilt() {
  const { isTouch, reducedMotion, lowPower } = usePointerGlow();
  const cardRef = useRef<HTMLButtonElement | HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (isTouch || e.pointerType === "touch" || reducedMotion || lowPower || !cardRef.current) {
        return;
      }
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      cardRef.current.style.setProperty("--card-px", `${x}px`);
      cardRef.current.style.setProperty("--card-py", `${y}px`);
      cardRef.current.style.setProperty("--card-active", "1");

      // Tilt up to 3 degrees
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = -((y - centerY) / centerY) * 3;
      const rotateY = ((x - centerX) / centerX) * 3;

      cardRef.current.style.transform = `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-2px)`;
    },
    [isTouch, reducedMotion, lowPower],
  );

  const onPointerEnter = useCallback(() => {
    setHovered(true);
  }, []);

  const onPointerLeave = useCallback(() => {
    setHovered(false);
    if (!cardRef.current) return;
    cardRef.current.style.setProperty("--card-active", "0");
    cardRef.current.style.transform =
      "perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px)";
  }, []);

  return {
    cardRef,
    hovered,
    onPointerMove,
    onPointerEnter,
    onPointerLeave,
  };
}

/**
 * Hook for magnetic primary button effect (moves up to 4px toward pointer when near).
 * Disabled on touch, reduced-motion, and low-power devices.
 */
export function useMagneticButton() {
  const { isTouch, reducedMotion, lowPower } = usePointerGlow();
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || isTouch || reducedMotion || lowPower) return;

    let rafId: number | null = null;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.hypot(dx, dy);

      // Trigger within 60px of the button center
      if (dist < rect.width / 2 + 50 && dist > 0) {
        const factor = Math.min(4, (60 / dist) * 2.5);
        const moveX = (dx / dist) * factor;
        const moveY = (dy / dist) * factor;
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            if (btnRef.current) {
              btnRef.current.style.transform = `translate(${moveX.toFixed(1)}px, ${moveY.toFixed(1)}px)`;
            }
            rafId = null;
          });
        }
      } else {
        if (btnRef.current && btnRef.current.style.transform !== "") {
          btnRef.current.style.transform = "";
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isTouch, reducedMotion, lowPower]);

  return btnRef;
}
