/**
 * useReveal — adds a CSS class to an element when it enters the viewport.
 *
 * Use for scroll-triggered fade-in animations:
 *
 *   const ref = useReveal();
 *   return <section ref={ref} className="reveal">…</section>;
 *
 * The element starts hidden (opacity: 0, translateY) and animates in when
 * 20% of it is visible. Once revealed, it stays revealed (no re-trigger).
 *
 * Respects prefers-reduced-motion: if the user prefers reduced motion, the
 * element is revealed immediately with no animation.
 */

import { useEffect, useRef } from "react";

export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect prefers-reduced-motion: just reveal immediately.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("revealed");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}
