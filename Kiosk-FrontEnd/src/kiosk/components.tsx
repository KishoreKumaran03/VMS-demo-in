import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Delete,
  FlaskConical,
  Globe,
  LifeBuoy,
  Phone,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HELP_CODE } from "./data";
import { SCREEN_NAMES, useKiosk } from "./store";
import { useMagneticButton } from "./pointer";

/* ---------- Button ---------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export function Btn({
  variant = "primary",
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const magRef = useMagneticButton();
  const { playFeedbackSound } = useKiosk();
  const v: Record<BtnVariant, string> = {
    primary:
      "bg-gradient-primary text-primary-foreground shadow-primary hover:brightness-105 active:scale-[0.98] disabled:opacity-45 disabled:shadow-none disabled:brightness-100",
    secondary:
      "bg-card text-foreground border border-border shadow-soft hover:bg-card/90 active:scale-[0.98] disabled:opacity-45",
    ghost: "text-primary hover:bg-primary-soft active:scale-[0.98] disabled:opacity-45",
    danger:
      "bg-destructive text-destructive-foreground shadow-soft hover:brightness-105 active:scale-[0.98] disabled:opacity-45",
    success:
      "bg-success text-success-foreground shadow-soft hover:brightness-105 active:scale-[0.98] disabled:opacity-45",
  };
  return (
    <button
      ref={variant === "primary" ? (magRef as React.RefObject<HTMLButtonElement>) : undefined}
      className={cn(
        "pressable inline-flex min-h-[72px] items-center justify-center gap-2 rounded-2xl px-8 text-[15px] font-semibold transition-all disabled:pointer-events-none",
        v[variant],
        className,
      )}
      onClick={(e) => {
        playFeedbackSound();
        rest.onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Clock ---------- */
export function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ---------- TopBar ---------- */
export function TopBar({ onHelp }: { onHelp: () => void }) {
  const now = useNow();
  const { soundEnabled, setSoundEnabled } = useKiosk();
  const [langOpen, setLangOpen] = useState(false);
  return (
    <header className="relative z-20 flex h-[76px] shrink-0 items-center justify-between px-8">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary shadow-primary">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-primary-foreground">
            <path d="M12 2l2.4 7.2H22l-6.1 4.5 2.3 7.3L12 16.5 5.8 21l2.3-7.3L2 9.2h7.6z" />
          </svg>
        </div>
        <span className="text-[17px] font-bold tracking-tight">Northstar</span>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 text-center">
        <div className="text-[15px] font-semibold tabular-nums">
          {now ? now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "\u00a0"}
        </div>
        <div className="text-[12px] text-muted-foreground">
          {now
            ? now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
            : "\u00a0"}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? "Sound enabled (click to mute)" : "Sound muted (click to enable)"}
          aria-label={soundEnabled ? "Sound enabled" : "Sound muted"}
          className={cn(
            "pressable flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card shadow-soft transition-colors",
            soundEnabled ? "text-primary border-primary/30" : "text-muted-foreground",
          )}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
        <div className="relative">
          <button
            onClick={() => setLangOpen((o) => !o)}
            className="pressable flex h-12 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-muted-foreground hover:bg-card"
          >
            <Globe className="h-4 w-4" /> English <ChevronDown className="h-4 w-4" />
          </button>
          {langOpen && (
            <div className="animate-fade absolute right-0 top-14 w-48 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-lift">
              {[
                ["English", true],
                ["हिन्दी Hindi", false],
                ["ಕನ್ನಡ Kannada", false],
              ].map(([l, ok]) => (
                <button
                  key={l as string}
                  disabled={!ok}
                  onClick={() => setLangOpen(false)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[14px] font-medium enabled:hover:bg-primary-soft disabled:text-muted-foreground"
                >
                  {l}
                  {ok ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <span className="text-[12px]">Coming soon</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onHelp}
          className="pressable flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-5 text-[14px] font-semibold text-primary shadow-soft"
        >
          <LifeBuoy className="h-4 w-4" /> Need help?
        </button>
      </div>
    </header>
  );
}

/* ---------- Modal shell ---------- */
export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div
      className="animate-fade fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="animate-screen w-full max-w-[460px] rounded-3xl bg-card p-8 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- HelpPanel ---------- */
export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addHelp, screen } = useKiosk();
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (open) setSent(false);
  }, [open]);
  if (!open) return null;
  return (
    <Modal onClose={onClose}>
      {!sent ? (
        <>
          <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <LifeBuoy className="h-7 w-7" />
          </div>
          <h2 className="text-[24px] font-bold">No problem, reception can help.</h2>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Tap below and someone from the front desk will come to you.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Btn
              onClick={() => {
                addHelp(SCREEN_NAMES[screen]);
                setSent(true);
              }}
            >
              <Phone className="h-5 w-5" /> Call reception
            </Btn>
            <button
              onClick={() => {
                onClose();
                go("faq");
              }}
              className="pressable flex h-12 items-center justify-center rounded-xl border border-border bg-card text-[14px] font-semibold text-primary shadow-soft hover:bg-primary-soft/50"
            >
              Read FAQs
            </button>
            <Btn variant="secondary" onClick={onClose}>
              Close
            </Btn>
          </div>
        </>
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
            <Check className="h-7 w-7" />
          </div>
          <h2 className="text-[24px] font-bold">Reception has been told.</h2>
          <p className="mt-2 text-[14px] text-muted-foreground">Your code is</p>
          <div className="my-3 text-[44px] font-bold tracking-[0.2em] text-primary">
            {HELP_CODE}
          </div>
          <p className="text-[14px] text-muted-foreground">
            Please stay here, someone will be with you shortly.
          </p>
          <Btn variant="secondary" className="mt-8 w-full" onClick={onClose}>
            Close
          </Btn>
        </div>
      )}
    </Modal>
  );
}

/* ---------- Countdown ring ---------- */
export function Ring({
  value,
  total,
  size = 120,
  tone = "primary",
  children,
}: {
  value: number;
  total: number;
  size?: number;
  tone?: "primary" | "warning";
  children?: ReactNode;
}) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, value / total);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={7}
          className="fill-none stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={7}
          strokeLinecap="round"
          className={cn(
            "fill-none transition-[stroke-dashoffset] duration-1000 ease-linear",
            tone === "primary" ? "stroke-primary" : "stroke-warning",
          )}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {children ?? <span className="text-[28px] font-bold tabular-nums">{value}</span>}
      </div>
    </div>
  );
}

/* ---------- IdleGuard ---------- */
const IDLE_MS = 60_000;
export function IdleGuard() {
  const { screen, endSession } = useKiosk();
  const [prompt, setPrompt] = useState(false);
  const [left, setLeft] = useState(15);
  const last = useRef(Date.now());

  useEffect(() => {
    const bump = () => {
      last.current = Date.now();
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, []);

  useEffect(() => {
    last.current = Date.now();
    setPrompt(false);
  }, [screen]);

  useEffect(() => {
    if (screen === "home") return;
    const t = setInterval(() => {
      if (!prompt && Date.now() - last.current > IDLE_MS) {
        setPrompt(true);
        setLeft(15);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [screen, prompt]);

  useEffect(() => {
    if (!prompt) return;
    if (left <= 0) {
      setPrompt(false);
      endSession("Your session ended to keep your information safe.");
      return;
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [prompt, left, endSession]);

  if (!prompt || screen === "home") return null;
  return (
    <Modal>
      <div className="text-center">
        <div className="mx-auto mb-5 w-fit">
          <Ring value={left} total={15} />
        </div>
        <h2 className="text-[24px] font-bold">Are you still there?</h2>
        <p className="mt-2 text-[14px] text-muted-foreground">
          For your privacy, we will start over soon.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <Btn
            variant="secondary"
            onClick={() => {
              setPrompt(false);
              endSession();
            }}
          >
            Start over
          </Btn>
          <Btn
            onClick={() => {
              last.current = Date.now();
              setPrompt(false);
            }}
          >
            Yes, I am here
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- StepIndicator ---------- */
export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-[12px] font-semibold transition-colors",
              i < current
                ? "text-success"
                : i === current
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full text-[12px]",
                i < current
                  ? "bg-success text-success-foreground"
                  : i === current
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
              )}
            >
              {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {s}
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-px w-6", i < current ? "bg-success" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Flow header (Back / steps / Cancel) ---------- */
export function FlowHeader({
  onBack,
  onCancel,
  steps,
  current,
}: {
  onBack?: () => void;
  onCancel?: () => void;
  steps?: string[];
  current?: number;
}) {
  const [confirm, setConfirm] = useState(false);
  const { endSession } = useKiosk();
  return (
    <div className="flex h-14 shrink-0 items-center justify-between">
      <div className="w-[140px]">
        {onBack && (
          <button
            onClick={onBack}
            className="pressable flex h-12 items-center gap-2 rounded-xl px-3 text-[14px] font-semibold text-muted-foreground hover:bg-card"
          >
            <ArrowLeft className="h-5 w-5" /> Back
          </button>
        )}
      </div>
      {steps && current !== undefined ? (
        <div className="flex items-center gap-4">
          <span className="rounded-full border border-border bg-card px-3 py-1 text-[12px] font-semibold text-muted-foreground shadow-soft">
            Step {current + 1} of {steps.length}
          </span>
          <StepIndicator steps={steps} current={current} />
        </div>
      ) : (
        <div />
      )}
      <div className="flex w-[140px] justify-end">
        {onCancel !== undefined && (
          <button
            onClick={() => setConfirm(true)}
            className="pressable flex h-12 items-center gap-2 rounded-xl px-3 text-[14px] font-semibold text-muted-foreground hover:bg-card"
          >
            <X className="h-5 w-5" /> Cancel
          </button>
        )}
      </div>
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <h2 className="text-[24px] font-bold">Start over?</h2>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Anything you have entered will be cleared and you will go back to the start.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Btn variant="secondary" onClick={() => setConfirm(false)}>
              Keep going
            </Btn>
            <Btn
              onClick={() => {
                setConfirm(false);
                onCancel?.();
                endSession();
              }}
            >
              Yes, start over
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Keypad ---------- */
export function Keypad({
  onDigit,
  onBackspace,
  onClear,
  compact,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  compact?: boolean;
}) {
  const { playFeedbackSound } = useKiosk();
  const key =
    "pressable grid place-items-center rounded-2xl bg-card text-[22px] font-semibold shadow-soft active:bg-primary-soft";
  const h = compact ? "h-[60px]" : "h-[68px]";
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = () => {
    holdTimer.current = setTimeout(() => {
      playFeedbackSound();
      onClear?.();
    }, 450);
  };
  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button
          key={d}
          className={cn(key, h)}
          onClick={() => {
            playFeedbackSound();
            onDigit(d);
          }}
        >
          {d}
        </button>
      ))}
      <button
        className={cn(key, h, "flex flex-col items-center justify-center text-muted-foreground")}
        onClick={() => {
          playFeedbackSound();
          onClear?.();
        }}
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        title="Press and hold to clear"
      >
        <span className="text-[13px] font-semibold leading-tight">Clear</span>
        <span className="text-[10px] text-muted-foreground/80 leading-tight">Hold to reset</span>
      </button>
      <button
        className={cn(key, h)}
        onClick={() => {
          playFeedbackSound();
          onDigit("0");
        }}
      >
        0
      </button>
      <button
        className={cn(key, h)}
        onClick={() => {
          playFeedbackSound();
          onBackspace();
        }}
        aria-label="Delete"
      >
        <Delete className="h-6 w-6 stroke-[2]" />
      </button>
    </div>
  );
}

/* ---------- Keyboard ---------- */
const ALPHA = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const SYM = ["1234567890", "@#&-_./'", "()+,!?:;", '"*%$'];
export function Keyboard({
  onKey,
  onBackspace,
  onDone,
  doneLabel = "Next",
}: {
  onKey: (k: string) => void;
  onBackspace: () => void;
  onDone?: () => void;
  doneLabel?: string;
}) {
  const { playFeedbackSound } = useKiosk();
  const [sym, setSym] = useState(false);
  const rows = sym ? SYM : ALPHA;
  const key =
    "pressable grid h-[54px] flex-1 place-items-center rounded-xl bg-card text-[17px] font-semibold shadow-soft active:bg-primary-soft";
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-muted/70 p-3">
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex justify-center gap-1.5"
          style={{ paddingInline: i === 2 ? "4%" : i === 3 ? "10%" : 0 }}
        >
          {r.split("").map((c) => (
            <button
              key={c}
              className={key}
              onClick={() => {
                playFeedbackSound();
                onKey(c);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      ))}
      <div className="flex gap-1.5">
        <button
          className={cn(key, "max-w-[90px] text-[13px]")}
          onClick={() => {
            playFeedbackSound();
            setSym((s) => !s);
          }}
        >
          {sym ? "ABC" : "123"}
        </button>
        <button
          className={cn(key, "text-[13px] text-muted-foreground")}
          style={{ flex: 4 }}
          onClick={() => {
            playFeedbackSound();
            onKey(" ");
          }}
        >
          space
        </button>
        <button
          className={cn(key, "max-w-[90px]")}
          onClick={() => {
            playFeedbackSound();
            onBackspace();
          }}
          aria-label="Delete"
        >
          <Delete className="h-5 w-5 stroke-[2]" />
        </button>
        {onDone && (
          <button
            className={cn(
              key,
              "max-w-[110px] bg-primary text-[14px] text-primary-foreground active:bg-primary",
            )}
            onClick={() => {
              playFeedbackSound();
              onDone();
            }}
          >
            {doneLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- OtpInput ---------- */
export function OtpInput({ value, error }: { value: string; error?: boolean }) {
  return (
    <div className={cn("flex gap-3", error && "animate-shake")}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "grid h-[68px] w-[56px] place-items-center rounded-2xl border-2 bg-card text-[26px] font-bold transition-colors",
            error
              ? "border-destructive text-destructive"
              : i === value.length
                ? "border-primary"
                : value[i]
                  ? "border-border"
                  : "border-border/70",
          )}
        >
          {value[i] ?? ""}
        </div>
      ))}
    </div>
  );
}

/* ---------- StatusScreen ---------- */
export type Tone = "success" | "warning" | "error" | "info";
export function StatusScreen({
  tone,
  icon,
  title,
  message,
  children,
  extra,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  message?: ReactNode;
  children?: ReactNode;
  extra?: ReactNode;
}) {
  const toneCls: Record<Tone, string> = {
    success: "bg-success-soft text-success border-success/20 ring-success/20",
    warning: "bg-warning-soft text-warning border-warning/20 ring-warning/20",
    error: "bg-destructive-soft text-destructive border-destructive/20 ring-destructive/20",
    info: "bg-primary-soft text-primary border-primary/20 ring-primary/20",
  };
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="relative mb-6">
        <span
          className={cn(
            "absolute -inset-2.5 rounded-full border border-current opacity-30 animate-pulse",
            toneCls[tone],
          )}
        />
        <div
          className={cn(
            "relative grid h-20 w-20 place-items-center rounded-full border shadow-soft [&_svg]:h-10 [&_svg]:w-10 [&_svg]:stroke-[2]",
            toneCls[tone],
          )}
        >
          {icon}
        </div>
      </div>
      <h1 className="max-w-[640px] text-[24px] font-bold leading-tight">{title}</h1>
      {message && (
        <p className="mt-3 max-w-[520px] text-[14px] leading-relaxed text-muted-foreground">
          {message}
        </p>
      )}
      {extra && <div className="mt-6">{extra}</div>}
      {children && <div className="mt-10 flex flex-wrap justify-center gap-4">{children}</div>}
    </div>
  );
}

/* ---------- Fake QR ---------- */
export function FakeQr({ seed, size = 96 }: { seed: string; size?: number }) {
  const n = 21;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const cells: boolean[] = [];
  for (let i = 0; i < n * n; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    cells.push(((h >> 16) & 1) === 1);
  }
  const finder = (x: number, y: number) => {
    for (const [fx, fy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ] as const) {
      const dx = x - fx,
        dy = y - fy;
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7)
        return dx === 0 ||
          dx === 6 ||
          dy === 0 ||
          dy === 6 ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
          ? 1
          : 0;
    }
    return -1;
  };
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      className="fill-foreground"
      shapeRendering="crispEdges"
    >
      {cells.map((on, i) => {
        const x = i % n,
          y = Math.floor(i / n);
        const f = finder(x, y);
        return f === 1 || (f === -1 && on) ? (
          <rect key={i} x={x} y={y} width={1} height={1} />
        ) : null;
      })}
    </svg>
  );
}

/* ---------- BadgePreview ---------- */
export function BadgePreview({
  name,
  host,
  dept,
  type,
  purpose,
  badgeNo,
}: {
  name: string;
  host: string;
  dept?: string;
  type: string;
  purpose?: string;
  badgeNo: string;
}) {
  const date = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <div className="w-[308px] overflow-hidden rounded-2xl bg-card shadow-lift">
      <div className="flex items-center justify-between bg-gradient-primary px-5 py-3 text-primary-foreground">
        <span className="text-[13px] font-bold">Northstar</span>
        <span className="rounded-full bg-primary-foreground/20 px-2.5 py-0.5 text-[12px] font-semibold">
          {type}
        </span>
      </div>
      <div className="flex gap-4 p-5">
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Visitor
          </div>
          <div className="truncate text-[18px] font-bold text-foreground">{name}</div>
          <div className="mt-2.5 text-[12px] text-muted-foreground">Host</div>
          <div className="truncate text-[13px] font-semibold text-foreground">
            {host}
            {dept ? <span className="font-normal text-muted-foreground"> ({dept})</span> : ""}
          </div>
          {purpose && (
            <>
              <div className="mt-2 text-[12px] text-muted-foreground">Purpose</div>
              <div className="truncate text-[12px] font-medium text-foreground" title={purpose}>
                {purpose}
              </div>
            </>
          )}
          <div className="mt-2 text-[12px] text-muted-foreground">{date}</div>
        </div>
        <div className="shrink-0 self-center">
          <FakeQr seed={badgeNo} size={80} />
        </div>
      </div>
      <div className="border-t border-dashed border-border px-5 py-2.5 text-left text-[12px] font-semibold text-muted-foreground">
        Badge {badgeNo}
      </div>
    </div>
  );
}

/* ---------- DemoPanel ---------- */
export function DemoPanel() {
  const { screen, go, printerFail, setPrinterFail } = useKiosk();
  const [open, setOpen] = useState(false);
  const item =
    "pressable w-full rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold hover:bg-primary-soft";
  return (
    <div className="fixed bottom-4 left-4 z-40">
      {open && (
        <div className="animate-fade mb-2 w-60 rounded-2xl border border-border bg-card p-2 shadow-lift">
          <div className="px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Demo controls
          </div>
          <button className={item} onClick={() => setPrinterFail(!printerFail)}>
            Printer failure: {printerFail ? "On" : "Off"}
          </button>
          <button
            className={item}
            onClick={() => {
              go("network");
              setOpen(false);
            }}
          >
            Show network error
          </button>
          <button
            className={item}
            onClick={() => {
              go("camera");
              setOpen(false);
            }}
          >
            Show camera error
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Demo controls"
        className={cn(
          "pressable grid h-10 w-10 place-items-center rounded-full border border-border bg-card/70 text-muted-foreground opacity-50 hover:opacity-100",
          screen === "waiting" && "opacity-90 ring-2 ring-warning",
        )}
      >
        <FlaskConical className="h-4 w-4" />
      </button>
    </div>
  );
}
