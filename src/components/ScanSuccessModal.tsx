import { useEffect, useState } from "react";
import { useHotkey } from "../stores/hooks";

interface ScanSuccessModalProps {
  count: number;
  onClose: () => void;
}

const CONFETTI_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

function ConfettiPiece({ index }: { index: number }) {
  const [style] = useState(() => {
    const color =
      CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const left = Math.random() * 100;
    const delay = Math.random() * 0.5;
    const duration = 1.5 + Math.random() * 1.5;
    const size = 6 + Math.random() * 6;
    const rotation = Math.random() * 360;
    const isCircle = index % 3 === 0;

    return {
      left: `${left}%`,
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: color,
      borderRadius: isCircle ? "50%" : "2px",
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
      transform: `rotate(${rotation}deg)`,
    } as React.CSSProperties;
  });

  return <div className="confetti-piece" style={style} />;
}

export function ScanSuccessModal({ count, onClose }: ScanSuccessModalProps) {
  useHotkey("closeModal", onClose);

  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="confetti-container">
        {Array.from({ length: 40 }, (_, i) => (
          <ConfettiPiece key={i} index={i} />
        ))}
      </div>
      <div className="relative z-[2] bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-sm mx-4 border border-stone-200 dark:border-white/10">
        <div className="p-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-[20px] font-semibold text-primary mb-2">
            Congrats!
          </h2>
          <p className="text-[14px] text-secondary mb-6">
            {count} new database{count !== 1 ? "s" : ""} found on localhost
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-[14px] font-medium text-secondary bg-stone-100 dark:bg-white/5 hover:bg-stone-200 dark:hover:bg-white/10 rounded-lg transition-colors"
          >
            Okay
          </button>
        </div>
      </div>

      <style>{`
        .confetti-container {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 1;
        }
        .confetti-piece {
          position: absolute;
          top: -10px;
          opacity: 0;
          animation: confetti-fall linear forwards;
        }
        @keyframes confetti-fall {
          0% {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
          80% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(100vh) rotate(720deg);
          }
        }
      `}</style>
    </div>
  );
}
