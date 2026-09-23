import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { Calculator, ChevronRight, X } from "lucide-react";
import {
  ESTIMATE_ANNUAL_RATE,
  LOAN_AMOUNT_DEFAULT,
  LOAN_AMOUNT_MAX,
  LOAN_AMOUNT_MIN,
  LOAN_AMOUNT_STEP,
  LOAN_TERMS,
  calcEstimate,
  formatCurrency,
} from "./loan-calculator";

const STORAGE_KEY = "toumua-calculator-pos-v4";

type Position = { x: number; y: number };

function isDragBlocked(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, select, textarea, a, button"));
}

function readStoredPosition(): Position | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Position;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

type Props = {
  boundsRef: React.RefObject<HTMLElement | null>;
};

export function LoanCalculator({ boundsRef }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  const [amount, setAmount] = useState(LOAN_AMOUNT_DEFAULT);
  const [termIndex, setTermIndex] = useState(2);
  const [position, setPosition] = useState<Position | null>(null);
  const [isXl, setIsXl] = useState(false);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const moveListenerRef = useRef<(event: PointerEvent | MouseEvent) => void>(() => {});
  const upListenerRef = useRef<() => void>(() => {});
  const handleWindowMove = useRef((event: PointerEvent | MouseEvent) => {
    moveListenerRef.current(event);
  }).current;
  const handleWindowUp = useRef(() => {
    upListenerRef.current();
  }).current;

  const term = LOAN_TERMS[termIndex];
  const estimate = useMemo(() => calcEstimate(amount, term.months), [amount, term.months]);
  const ratePercent = Math.round(ESTIMATE_ANNUAL_RATE * 100);
  const detailsId = "loan-estimate-details";

  const sliderPercent =
    ((amount - LOAN_AMOUNT_MIN) / (LOAN_AMOUNT_MAX - LOAN_AMOUNT_MIN)) * 100;

  function clampToBounds(next: Position): Position {
    const bounds = boundsRef.current?.getBoundingClientRect();
    const card = cardRef.current?.getBoundingClientRect();
    if (!bounds || !card) return next;
    const width = card.width;
    const height = card.height;
    return {
      x: Math.min(Math.max(16, next.x), Math.max(16, bounds.width - width - 16)),
      y: Math.min(Math.max(16, next.y), Math.max(16, bounds.height - height - 16)),
    };
  }

  function detachDragListeners() {
    window.removeEventListener("pointermove", handleWindowMove);
    window.removeEventListener("mousemove", handleWindowMove);
    window.removeEventListener("pointerup", handleWindowUp);
    window.removeEventListener("mouseup", handleWindowUp);
    window.removeEventListener("pointercancel", handleWindowUp);
  }

  moveListenerRef.current = (event: PointerEvent | MouseEvent) => {
    if (!draggingRef.current) return;
    const bounds = boundsRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setPosition(
      clampToBounds({
        x: event.clientX - bounds.left - dragOffset.current.x,
        y: event.clientY - bounds.top - dragOffset.current.y,
      }),
    );
  };

  upListenerRef.current = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    detachDragListeners();
    setPosition((current) => {
      if (!current) return current;
      const clamped = clampToBounds(current);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
      return clamped;
    });
  };

  useEffect(() => {
    setPosition(readStoredPosition());
    const media = window.matchMedia("(min-width: 1280px)");
    const sync = () => setIsXl(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      detachDragListeners();
    };
  }, []);

  function onCardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !window.matchMedia("(min-width: 1280px)").matches) return;
    if (isDragBlocked(event.target)) return;
    const card = cardRef.current;
    const bounds = boundsRef.current;
    if (!card || !bounds) return;
    const cardBox = card.getBoundingClientRect();
    const boundsBox = bounds.getBoundingClientRect();
    dragOffset.current = {
      x: event.clientX - cardBox.left,
      y: event.clientY - cardBox.top,
    };
    setPosition({
      x: cardBox.left - boundsBox.left,
      y: cardBox.top - boundsBox.top,
    });
    draggingRef.current = true;
    setDragging(true);
    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("mouseup", handleWindowUp);
    window.addEventListener("pointercancel", handleWindowUp);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* some browsers reject capture without a trusted pointer */
    }
    event.preventDefault();
  }

  const placement =
    isXl && position
      ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
      : undefined;

  return (
    <div
      ref={cardRef}
      className={`relative z-20 mx-auto w-full max-w-[420px] xl:absolute xl:right-[274px] xl:top-[168px] xl:mx-0 xl:w-[360px] ${dragging ? "select-none" : ""}`}
      style={placement}
      onPointerDown={onCardPointerDown}
      onPointerMove={(event) => moveListenerRef.current(event.nativeEvent)}
      onPointerUp={() => upListenerRef.current()}
      onPointerCancel={() => upListenerRef.current()}
    >
      {open ? (
        <div
          className={`relative rounded-[20px] border border-border/70 bg-white px-4 py-3.5 shadow-card ${
            dragging ? "cursor-grabbing" : ""
          }`}
        >
          <div className="mb-2 flex items-center justify-end">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-bg-warm hover:text-text"
              aria-label="Close calculator"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="flex items-end justify-between gap-3">
            <p className="text-[14px] font-medium text-text-secondary">How much to borrow?</p>
            <p className="text-[28px] font-bold leading-none tracking-tight text-text">
              {formatCurrency(amount)}
            </p>
          </div>

          <div className="mt-3">
            <input
              type="range"
              min={LOAN_AMOUNT_MIN}
              max={LOAN_AMOUNT_MAX}
              step={LOAN_AMOUNT_STEP}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              className="loan-slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border"
              style={{
                background: `linear-gradient(to right, #075E45 0%, #075E45 ${sliderPercent}%, #EAECF0 ${sliderPercent}%, #EAECF0 100%)`,
              }}
              aria-valuemin={LOAN_AMOUNT_MIN}
              aria-valuemax={LOAN_AMOUNT_MAX}
              aria-valuenow={amount}
              aria-label="Loan amount"
              aria-describedby={detailsId}
            />
            <div className="mt-1.5 flex justify-between text-[13px] text-text-muted">
              <span>{formatCurrency(LOAN_AMOUNT_MIN)}</span>
              <span>{formatCurrency(LOAN_AMOUNT_MAX)}</span>
            </div>
          </div>

          <label className="mt-3 block">
            <span className="text-[14px] font-medium text-text-secondary">Loan term</span>
            <select
              value={termIndex}
              onChange={(event) => setTermIndex(Number(event.target.value))}
              className="mt-1 h-10 w-full cursor-pointer rounded-[12px] border border-border bg-white px-3 text-[14px] text-text outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              {LOAN_TERMS.map((option, index) => (
                <option key={option.months} value={index}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-3">
            <p className="text-[13px] text-text-secondary">Estimated weekly repayment</p>
            <p className="mt-0.5 text-[22px] font-bold tracking-tight text-text">
              {formatCurrency(estimate.weekly)}
              <span className="text-[14px] font-semibold text-text-secondary"> / week</span>
            </p>
          </div>

          <dl id={detailsId} className="mt-3 space-y-1 text-[13px] text-text-secondary">
            <div className="flex justify-between gap-3">
              <dt>Illustrative annual rate</dt>
              <dd className="font-semibold text-text">{ratePercent}% p.a.</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Total amount payable</dt>
              <dd className="font-semibold text-text">{formatCurrency(estimate.totalPayable)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Interest in this estimate</dt>
              <dd className="font-semibold text-text">{formatCurrency(estimate.totalInterest)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Establishment and other fees</dt>
              <dd className="font-semibold text-text">Not included</dd>
            </div>
          </dl>
          <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
            Estimate only. Final terms are confirmed by our office. {estimate.weeks} weekly
            payments.
          </p>

          <Link
            to="/login"
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary text-[14px] font-semibold text-white no-underline transition-all hover:-translate-y-px hover:bg-primary-hover"
          >
            Get started
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </Link>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-text shadow-card transition-all hover:-translate-y-px"
          onClick={() => setOpen(true)}
        >
          <Calculator className="h-4 w-4 text-primary" strokeWidth={1.8} />
          Open calculator
        </button>
      )}
    </div>
  );
}
