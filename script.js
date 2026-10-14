const yearElement = document.getElementById("year");
if (yearElement) yearElement.textContent = new Date().getFullYear();

/* ---------- Skills tabs ---------- */
const initSkillsTabs = () => {
  const tabs = Array.from(document.querySelectorAll(".skills-tab"));
  const panels = Array.from(document.querySelectorAll(".skills-panel"));

  if (!tabs.length || !panels.length) return;

  const activateTab = (nextTab) => {
    tabs.forEach((tab) => {
      const isActive = tab === nextTab;
      const panelId = tab.getAttribute("data-target");
      const panel = panelId ? document.getElementById(panelId) : null;

      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;

      if (panel) {
        panel.classList.toggle("is-active", isActive);
        panel.hidden = !isActive;
      }
    });
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex = (index + delta + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        activateTab(tabs[nextIndex]);
      } else if (event.key === "Home") {
        event.preventDefault();
        tabs[0].focus();
        activateTab(tabs[0]);
      } else if (event.key === "End") {
        event.preventDefault();
        const lastTab = tabs[tabs.length - 1];
        lastTab.focus();
        activateTab(lastTab);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateTab(tab);
      }
    });
  });

  activateTab(tabs.find((tab) => tab.classList.contains("is-active")) || tabs[0]);
};

initSkillsTabs();

/* ---------- Motion: particles, glow, parallax, cursor ----------
   One requestAnimationFrame loop drives everything. Nothing here touches
   layout (left/top/width/height) or root CSS variables; elements move with
   transform only, which keeps the work on the compositor. */
const initMotion = () => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return;

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const canvas = document.getElementById("ambient-canvas");
  const ctx = canvas ? canvas.getContext("2d") : null;
  const glow = document.querySelector(".pointer-glow");
  const orbA = document.querySelector(".parallax-orb-a");
  const orbB = document.querySelector(".parallax-orb-b");
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  const useCursor = finePointer && !!dot && !!ring;

  if (useCursor) document.body.classList.add("custom-cursor");

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let glowHalf = 0;

  /* Pointer state.
     tx/ty = raw position, x/y = eased position (background effects),
     strength fades the particle interaction in and out. */
  const pointer = { tx: vw / 2, ty: vh / 2, x: vw / 2, y: vh / 2, active: false, strength: 0 };

  const setTarget = (x, y) => {
    pointer.tx = x;
    pointer.ty = y;
    if (!pointer.active) {
      pointer.x = x;
      pointer.y = y;
      pointer.active = true;
    }
  };

  /* ----- Cursor ----- */
  let cursorOn = false;
  let hovering = false;
  let ringX = 0;
  let ringY = 0;
  let ringScale = 1;

  const showCursor = () => {
    if (cursorOn) return;
    cursorOn = true;
    ringX = pointer.tx;
    ringY = pointer.ty;
    document.body.classList.add("cursor-ready");
  };

  const hideCursor = () => {
    cursorOn = false;
    document.body.classList.remove("cursor-ready");
  };

  const release = () => {
    pointer.active = false;
    if (useCursor) hideCursor();
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") return;
      setTarget(event.clientX, event.clientY);
      if (useCursor && event.pointerType === "mouse") showCursor();
    },
    { passive: true }
  );

  document.documentElement.addEventListener("mouseleave", release);
  window.addEventListener("blur", release);

  const touchTo = (event) => {
    const touch = event.touches[0];
    if (touch) setTarget(touch.clientX, touch.clientY);
  };
  window.addEventListener("touchstart", touchTo, { passive: true });
  window.addEventListener("touchmove", touchTo, { passive: true });
  window.addEventListener(
    "touchend",
    () => {
      pointer.active = false;
      pointer.tx = vw / 2;
      pointer.ty = vh / 2;
    },
    { passive: true }
  );

  if (useCursor) {
    const interactive = "a, button, .btn, .project-card, .skill-tile, [role='tab']";
    document.addEventListener(
      "pointerover",
      (event) => {
        const target = event.target;
        hovering = !!(target && target.closest && target.closest(interactive));
        ring.classList.toggle("is-hover", hovering);
      },
      { passive: true }
    );
  }

  /* ----- Particle network ----- */
  const LINK_DISTANCE = 180;
  const LINK_DISTANCE_SQ = LINK_DISTANCE * LINK_DISTANCE;
  const MOUSE_RADIUS = 250;
  const MOUSE_RADIUS_SQ = MOUSE_RADIUS * MOUSE_RADIUS;
  const BUCKETS = 6; // links are batched by opacity: 6 strokes per frame instead of hundreds
  const MAX_SPEED = 7;

  const particles = [];
  const linkBuckets = Array.from({ length: BUCKETS }, () => []);
  const mouseLinks = [];
  let dpr = 1;

  const makeParticle = () => {
    const bx = (Math.random() - 0.5) * 0.8;
    const by = (Math.random() - 0.5) * 0.8;
    const alpha = Math.random() * 0.6 + 0.2;
    return {
      x: Math.random() * vw,
      y: Math.random() * vh,
      vx: bx,
      vy: by,
      bx, // resting drift: velocity eases back to this after the cursor pushes it
      by,
      r: Math.random() * 2.5 + 1,
      fill: `rgba(150, 196, 255, ${alpha.toFixed(2)})`,
    };
  };

  let resizePending = false;
  let lastW = 0;
  let lastH = 0;

  const resize = () => {
    resizePending = false;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // On touch devices the URL bar changes the height while scrolling; ignore small height-only changes.
    if (!finePointer && w === lastW && Math.abs(h - lastH) < 120) return;
    lastW = w;
    lastH = h;
    vw = w;
    vh = h;

    if (glow) glowHalf = glow.offsetWidth / 2;
    if (!pointer.active) {
      pointer.tx = pointer.x = vw / 2;
      pointer.ty = pointer.y = vh / 2;
    }

    if (!canvas || !ctx) return;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Same density as before on a 1080p screen (150), fewer on small screens.
    const target = Math.max(50, Math.min(150, Math.round((vw * vh) / 13000)));
    while (particles.length < target) particles.push(makeParticle());
    particles.length = Math.min(particles.length, target);
    particles.forEach((p) => {
      p.x = Math.min(p.x, vw);
      p.y = Math.min(p.y, vh);
    });
  };

  window.addEventListener(
    "resize",
    () => {
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(resize);
    },
    { passive: true }
  );

  const updateParticles = (step) => {
    const mx = pointer.x;
    const my = pointer.y;
    const interacting = pointer.strength > 0.01;
    const settle = 1 - Math.pow(1 - 0.03, step); // how quickly velocity returns to the resting drift
    mouseLinks.length = 0;

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];

      if (interacting) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < MOUSE_RADIUS_SQ) {
          const d = Math.sqrt(d2) || 1;
          const force = (1 - d / MOUSE_RADIUS) * pointer.strength;
          p.vx += (dx / d) * force * 0.4 * step;
          p.vy += (dy / d) * force * 0.4 * step;
          mouseLinks.push(p, force);
        }
      }

      // Ease toward the resting drift instead of adding random noise each frame.
      p.vx += (p.bx - p.vx) * settle;
      p.vy += (p.by - p.vy) * settle;

      if (p.vx > MAX_SPEED) p.vx = MAX_SPEED;
      else if (p.vx < -MAX_SPEED) p.vx = -MAX_SPEED;
      if (p.vy > MAX_SPEED) p.vy = MAX_SPEED;
      else if (p.vy < -MAX_SPEED) p.vy = -MAX_SPEED;

      p.x += p.vx * step;
      p.y += p.vy * step;

      if (p.x < 0) {
        p.x = 0;
        p.vx = Math.abs(p.vx);
        p.bx = Math.abs(p.bx);
      } else if (p.x > vw) {
        p.x = vw;
        p.vx = -Math.abs(p.vx);
        p.bx = -Math.abs(p.bx);
      }
      if (p.y < 0) {
        p.y = 0;
        p.vy = Math.abs(p.vy);
        p.by = Math.abs(p.by);
      } else if (p.y > vh) {
        p.y = vh;
        p.vy = -Math.abs(p.vy);
        p.by = -Math.abs(p.by);
      }
    }
  };

  const drawParticles = () => {
    ctx.clearRect(0, 0, vw, vh);

    // Particle-to-particle links, batched by opacity bucket.
    for (let b = 0; b < BUCKETS; b += 1) linkBuckets[b].length = 0;

    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const c = particles[j];
        const dx = a.x - c.x;
        const dy = a.y - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DISTANCE_SQ) {
          const t = 1 - Math.sqrt(d2) / LINK_DISTANCE;
          const bucket = Math.min(BUCKETS - 1, (t * BUCKETS) | 0);
          linkBuckets[bucket].push(a.x, a.y, c.x, c.y);
        }
      }
    }

    ctx.lineWidth = 0.6;
    for (let b = 0; b < BUCKETS; b += 1) {
      const segs = linkBuckets[b];
      if (!segs.length) continue;
      const alpha = ((b + 0.5) / BUCKETS) * 0.22;
      ctx.strokeStyle = `rgba(110, 168, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      for (let k = 0; k < segs.length; k += 4) {
        ctx.moveTo(segs[k], segs[k + 1]);
        ctx.lineTo(segs[k + 2], segs[k + 3]);
      }
      ctx.stroke();
    }

    // Cursor-to-particle links (teal).
    if (mouseLinks.length) {
      ctx.lineWidth = 1;
      for (let k = 0; k < mouseLinks.length; k += 2) {
        const p = mouseLinks[k];
        const force = mouseLinks[k + 1];
        ctx.strokeStyle = `rgba(152, 245, 225, ${(force * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
      }
    }

    // Dots.
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      ctx.fillStyle = p.fill;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /* ----- Main loop ----- */
  let last = performance.now();
  let rafId = 0;

  const frame = (now) => {
    const dt = Math.min(now - last, 50); // ms, clamped so a stalled tab doesn't cause a jump
    last = now;
    const step = dt / 16.667; // 1 at 60fps, 0.5 at 120fps: motion speed is the same on any refresh rate

    // Eased pointer for the background.
    const follow = 1 - Math.exp(-dt / 150);
    pointer.x += (pointer.tx - pointer.x) * follow;
    pointer.y += (pointer.ty - pointer.y) * follow;
    pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * (1 - Math.exp(-dt / 120));

    if (glow) {
      glow.style.transform = `translate3d(${(pointer.x - glowHalf).toFixed(1)}px, ${(pointer.y - glowHalf).toFixed(1)}px, 0)`;
    }
    if (orbA || orbB) {
      const px = (pointer.x / Math.max(vw, 1) - 0.5) * 26;
      const py = (pointer.y / Math.max(vh, 1) - 0.5) * 20;
      if (orbA) orbA.style.transform = `translate3d(${(-px * 0.55).toFixed(2)}px, ${(-py * 0.55).toFixed(2)}px, 0)`;
      if (orbB) orbB.style.transform = `translate3d(${(px * 0.45).toFixed(2)}px, ${(py * 0.45).toFixed(2)}px, 0)`;
    }

    if (canvas && ctx) {
      updateParticles(step);
      drawParticles();
    }

    if (useCursor && cursorOn) {
      // Dot sticks to the pointer; ring trails it with a time-based ease (same feel at any frame rate).
      dot.style.transform = `translate3d(${pointer.tx}px, ${pointer.ty}px, 0)`;
      ringX += (pointer.tx - ringX) * (1 - Math.exp(-dt / 70));
      ringY += (pointer.ty - ringY) * (1 - Math.exp(-dt / 70));
      ringScale += ((hovering ? 1.35 : 1) - ringScale) * (1 - Math.exp(-dt / 90));
      ring.style.transform = `translate3d(${ringX.toFixed(2)}px, ${ringY.toFixed(2)}px, 0) scale(${ringScale.toFixed(3)})`;
    }

    rafId = requestAnimationFrame(frame);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else {
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  });

  resize();
  rafId = requestAnimationFrame(frame);
};

initMotion();
