/**
 * <Reveal> — wrap any element/section to fade it in when it scrolls into view.
 *
 *   <Reveal as="section" className="...">
 *     ...
 *   </Reveal>
 *
 * Uses IntersectionObserver under the hood. Once revealed, stays revealed.
 * Respects prefers-reduced-motion (shows immediately, no animation).
 */

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
