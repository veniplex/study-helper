"use client"

import * as React from "react"
import { Pause, Play, RotateCcw, SkipForward, Square, Timer, Volume2, VolumeX } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { logStudySession } from "@/app/[locale]/(app)/learn-actions"
import { ModuleSelect, type ModuleOption } from "@/components/learn/module-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "studyhelper.pomodoro"
const CYCLES_PER_ROUND = 4

type Phase = "focus" | "break" | "longBreak"

type PersistedState = {
  phase: Phase
  endsAt: number | null // running timer target (epoch ms)
  remainingMs: number // remaining when paused
  focusMin: number
  breakMin: number
  longBreakMin: number
  /** Completed focus intervals in the current round (0..CYCLES_PER_ROUND). */
  cycle: number
  moduleId: string
  sound: boolean
}

const DEFAULTS: PersistedState = {
  phase: "focus",
  endsAt: null,
  remainingMs: 25 * 60 * 1000,
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycle: 0,
  moduleId: "",
  sound: true,
}

const PHASE_STYLES: Record<
  Phase,
  { text: string; ring: string; pill: string; bar: string }
> = {
  focus: {
    text: "text-amber-600 dark:text-amber-400",
    ring: "stroke-amber-500",
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  break: {
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "stroke-emerald-500",
    pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
  longBreak: {
    text: "text-sky-600 dark:text-sky-400",
    ring: "stroke-sky-500",
    pill: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    bar: "bg-sky-500",
  },
}

function load(): PersistedState {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as PersistedState) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function phaseMinutes(s: PersistedState, phase: Phase): number {
  return phase === "focus" ? s.focusMin : phase === "break" ? s.breakMin : s.longBreakMin
}

function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
    osc.onended = () => void ctx.close()
  } catch {
    // audio not available — ignore
  }
}

export function Pomodoro({ modules }: { modules: ModuleOption[] }) {
  const t = useTranslations("pomodoro")
  const router = useRouter()
  const [state, setState] = React.useState<PersistedState>(DEFAULTS)
  const [now, setNow] = React.useState(() => Date.now())
  const [hydrated, setHydrated] = React.useState(false)

  // Load persisted state after mount (avoids SSR hydration mismatch).
  // setState in effect is intentional here: localStorage is client-only.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(load())
    setHydrated(true)
  }, [])

  // Persist on change
  React.useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state, hydrated])

  const running = state.endsAt != null
  const remaining = running ? Math.max(0, state.endsAt! - now) : state.remainingMs
  const phaseTotal = phaseMinutes(state, state.phase) * 60 * 1000
  const progress = phaseTotal > 0 ? 1 - remaining / phaseTotal : 0
  const styles = PHASE_STYLES[state.phase]
  const phaseLabel =
    state.phase === "focus" ? t("focus") : state.phase === "break" ? t("break") : t("longBreak")

  const stateRef = React.useRef(state)
  React.useEffect(() => {
    stateRef.current = state
  }, [state])

  const completePhase = React.useCallback(
    (opts?: { skip?: boolean }) => {
      const s = stateRef.current
      if (s.endsAt == null && !opts?.skip) return
      const finishedPhase = s.phase
      const cycle = finishedPhase === "focus" ? s.cycle + 1 : s.phase === "longBreak" ? 0 : s.cycle
      const nextPhase: Phase =
        finishedPhase === "focus"
          ? cycle >= CYCLES_PER_ROUND
            ? "longBreak"
            : "break"
          : "focus"
      const nextMs = phaseMinutes(s, nextPhase) * 60 * 1000
      const nowMs = Date.now()
      // Auto-continue into the next phase. If the tab slept past the target
      // (or this was a manual skip), hand over paused instead of mid-phase.
      const base = s.endsAt ?? nowMs
      const autoRun = !opts?.skip && nowMs - base < 5000
      setState((prev) => ({
        ...prev,
        phase: nextPhase,
        cycle: nextPhase === "focus" && finishedPhase === "longBreak" ? 0 : cycle,
        endsAt: autoRun ? base + nextMs : null,
        remainingMs: nextMs,
      }))
      if (finishedPhase === "focus" && !opts?.skip) {
        void logStudySession({
          moduleId: s.moduleId || null,
          durationMinutes: s.focusMin,
          kind: "pomodoro",
        })
          .then(() => {
            toast.success(t("focusDone", { minutes: s.focusMin }))
            router.refresh()
          })
          .catch((error) =>
            toast.error(error instanceof Error ? error.message : String(error))
          )
      }
      if (!opts?.skip) {
        if (s.sound) beep()
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const body =
            finishedPhase === "focus" ? t("focusDone", { minutes: s.focusMin }) : t("breakDone")
          new Notification("StudyHelper", { body })
        }
        if (finishedPhase !== "focus") toast.info(t("breakDone"))
      }
    },
    [router, t]
  )

  // Tick while running; complete the phase when time is up
  const endsAt = state.endsAt
  React.useEffect(() => {
    if (endsAt == null) return
    const id = window.setInterval(() => {
      const nowMs = Date.now()
      setNow(nowMs)
      if (nowMs >= endsAt) completePhase()
    }, 1000)
    return () => window.clearInterval(id)
  }, [endsAt, completePhase])

  function start() {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission()
    }
    setNow(Date.now())
    setState((s) => (s.endsAt ? s : { ...s, endsAt: Date.now() + s.remainingMs }))
  }

  function pause() {
    setState((s) => ({
      ...s,
      endsAt: null,
      remainingMs: s.endsAt ? Math.max(0, s.endsAt - Date.now()) : s.remainingMs,
    }))
  }

  function stop() {
    setState((s) => ({
      ...s,
      phase: "focus",
      cycle: 0,
      endsAt: null,
      remainingMs: s.focusMin * 60 * 1000,
    }))
  }

  function reset() {
    setState((s) => ({
      ...s,
      endsAt: null,
      remainingMs: phaseMinutes(s, s.phase) * 60 * 1000,
    }))
  }

  function setDuration(key: "focusMin" | "breakMin" | "longBreakMin", value: number) {
    setState((s) => {
      const next = { ...s, [key]: value }
      const activeKey =
        s.phase === "focus" ? "focusMin" : s.phase === "break" ? "breakMin" : "longBreakMin"
      if (s.endsAt == null && key === activeKey) next.remainingMs = value * 60 * 1000
      return next
    })
  }

  // Ring geometry
  const R = 52
  const C = 2 * Math.PI * R

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "relative flex h-8 items-center gap-1.5 overflow-hidden rounded-full text-sm transition-colors",
              running ? cn("px-3 font-medium", styles.pill) : "text-foreground/80 hover:bg-accent w-8 justify-center"
            )}
          />
        }
      >
        <Timer className="size-4" />
        {running && (
          <>
            <span className="text-xs font-semibold tabular-nums">{fmt(remaining)}</span>
            <span
              className={cn("absolute inset-x-0 bottom-0 h-0.5 origin-left", styles.bar)}
              style={{ transform: `scaleX(${progress})` }}
            />
          </>
        )}
        <span className="sr-only">{t("title")}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] max-w-[calc(100vw-2rem)] p-4">
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                styles.pill
              )}
            >
              {phaseLabel}
            </span>
            <div className="relative">
              <svg width="140" height="140" viewBox="0 0 120 120" className="-rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  strokeWidth="6"
                  className="stroke-muted"
                />
                <circle
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  className={cn("transition-[stroke-dashoffset] duration-1000 ease-linear", styles.ring)}
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - progress)}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-3xl font-semibold tabular-nums">
                {fmt(remaining)}
              </span>
            </div>
            <div className="flex gap-1.5" aria-label={t("cycle", { done: state.cycle, total: CYCLES_PER_ROUND })}>
              {Array.from({ length: CYCLES_PER_ROUND }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "size-2 rounded-full",
                    i < state.cycle ? cn("opacity-100", PHASE_STYLES.focus.bar) : "bg-muted"
                  )}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5">
            {running ? (
              <Button variant="outline" size="sm" onClick={pause}>
                <Pause className="size-4" />
                {t("pause")}
              </Button>
            ) : (
              <Button size="sm" onClick={start} disabled={remaining <= 0}>
                <Play className="size-4" />
                {t("start")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              title={t("skip")}
              onClick={() => completePhase({ skip: true })}
            >
              <SkipForward className="size-4" />
              <span className="sr-only">{t("skip")}</span>
            </Button>
            <Button variant="ghost" size="icon-sm" title={t("reset")} onClick={reset}>
              <RotateCcw className="size-4" />
              <span className="sr-only">{t("reset")}</span>
            </Button>
            <Button variant="ghost" size="icon-sm" title={t("stop")} onClick={stop}>
              <Square className="size-4" />
              <span className="sr-only">{t("stop")}</span>
            </Button>
          </div>

          <div className="grid min-w-0 grid-cols-3 gap-2">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="pomo-focus" className="block truncate text-xs">
                {t("focusMinutes")}
              </Label>
              <Input
                id="pomo-focus"
                type="number"
                min={1}
                max={180}
                className="h-8"
                value={state.focusMin}
                onChange={(e) => setDuration("focusMin", Math.max(1, Number(e.target.value) || 25))}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="pomo-break" className="block truncate text-xs">
                {t("breakMinutes")}
              </Label>
              <Input
                id="pomo-break"
                type="number"
                min={1}
                max={60}
                className="h-8"
                value={state.breakMin}
                onChange={(e) => setDuration("breakMin", Math.max(1, Number(e.target.value) || 5))}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="pomo-long-break" className="block truncate text-xs">
                {t("longBreakMinutes")}
              </Label>
              <Input
                id="pomo-long-break"
                type="number"
                min={1}
                max={90}
                className="h-8"
                value={state.longBreakMin}
                onChange={(e) =>
                  setDuration("longBreakMin", Math.max(1, Number(e.target.value) || 15))
                }
              />
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">{t("module")}</Label>
              <ModuleSelect
                modules={modules}
                value={state.moduleId}
                onChange={(v) => setState((s) => ({ ...s, moduleId: v }))}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={state.sound}
              onClick={() => setState((s) => ({ ...s, sound: !s.sound }))}
            >
              {state.sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              <span className="sr-only">{t("sound")}</span>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
