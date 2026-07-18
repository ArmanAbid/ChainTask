// <Reveal> - wrap any element/section to fade it in when it scrolls into view.

import { createElement, type ReactNode, type ElementType } from "react";
import { useReveal } from "@/hooks/useReveal";

interface RevealProps {
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  id?: string;
}

export function Reveal({ as = "div", className = "", children, id }: RevealProps) {
  const ref = useReveal<HTMLElement>();
  return createElement(
    as,
    { ref, id, className: `reveal ${className}`.trim() },
    children,
  );
}
