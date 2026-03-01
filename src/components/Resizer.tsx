import { useCallback, useEffect, useState } from "react";

interface ResizerProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
}

export function Resizer({ direction, onResize }: ResizerProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    let lastPos = direction === "horizontal" ? 0 : 0;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === "horizontal" ? e.clientX : e.clientY;
      if (lastPos !== 0) {
        const delta = currentPos - lastPos;
        onResize(delta);
      }
      lastPos = currentPos;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, direction, onResize]);

  const isHorizontal = direction === "horizontal";

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        ${isHorizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"}
        flex-shrink-0 bg-transparent hover:bg-blue-500/50 active:bg-blue-500/50 transition-colors
        ${isDragging ? "bg-blue-500/50" : ""}
      `}
      style={{
        // Expand hit area
        ...(isHorizontal
          ? { marginLeft: -4, marginRight: -4, paddingLeft: 4, paddingRight: 4 }
          : {
              marginTop: -4,
              marginBottom: -4,
              paddingTop: 4,
              paddingBottom: 4,
            }),
      }}
    />
  );
}
