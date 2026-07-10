"use client"

import * as React from "react"
import { Pause, Play, RotateCcw, Timer } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { logStudySession } from "@/app/[locale]/(app)/learn-actions"
import { ModuleSelect, type ModuleOption } from "@/components/learn/module-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "studyhelper.pomodoro"

type Phase = "focus" | "break"

type PersistedState = {
  phase: Phase
  endsAt: number | null // running timer target (epoch ms)
  remainingMs: number // remaining when paused
  focusMin: number
  breakMin: number
  moduleId: string
}

const DEFAULTS: PersistedState = {
  phase: "focus",
  endsAt: null,
  remainingMs: 25 * 60 * 1000,
  focusMin: 25,
  breakMin: 5,
  moduleId: "",
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

export function Pomodoro({ modules }: { modules: ModuleOption[] }) {
  const t = useTranslations("pomodoro")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
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

  const stateRef = React.useRef(state)
  React.useEffect(() => {
    stateRef.current = state
  }, [state])

  const completePhase = React.useCallback(() => {
    const s = stateRef.current
    if (s.endsAt == null) return
    const finishedPhase = s.phase
    const nextPhase: Phase = finishedPhase === "focus" ? "break" : "focus"
    const nextMin = nextPhase === "focus" ? s.focusMin : s.breakMin
    setState((prev) => ({
      ...prev,
      phase: nextPhase,
      endsAt: null,
      remainingMs: nextMin * 60 * 1000,
    }))
    if (finishedPhase === "focus") {
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
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("StudyHelper", { body: t("focusDone", { minutes: s.focusMin }) })
      }
    } else {
      toast.info(t("breakDone"))
    }
  }, [router, t])

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

  function reset() {
    setState((s) => ({
      ...s,
      phase: "focus",
      endsAt: null,
      remainingMs: s.focusMin * 60 * 1000,
    }))
  }

  function setDurations(focusMin: number, breakMin: number) {
    setState((s) => ({
      ...s,
      focusMin,
      breakMin,
      ...(s.endsAt == null && s.phase === "focus"
        ? { remainingMs: focusMin * 60 * 1000 }
        : {}),
    }))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size={running ? "sm" : "icon"} />}
      >
        <Timer className={cn("size-4.5", running && state.phase === "focus" && "text-primary")} />
        {running && <span className="text-xs font-medium tabular-nums">{fmt(remaining)}</span>}
        <span className="sr-only">{t("title")}</span>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {state.phase === "focus" ? t("focus") : t("break")}
            </p>
            <p className="text-4xl font-semibold tabular-nums">{fmt(remaining)}</p>
          </div>
          <div className="flex justify-center gap-2">
            {running ? (
              <Button variant="outline" onClick={pause}>
                <Pause className="size-4" />
                {t("pause")}
              </Button>
            ) : (
              <Button onClick={start} disabled={remaining <= 0}>
                <Play className="size-4" />
                {t("start")}
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>
              <RotateCcw className="size-4" />
              {t("reset")}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pomo-focus">{t("focusMinutes")}</Label>
              <Input
                id="pomo-focus"
                type="number"
                min={1}
                max={180}
                value={state.focusMin}
                onChange={(e) =>
                  setDurations(Math.max(1, Number(e.target.value) || 25), state.breakMin)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pomo-break">{t("breakMinutes")}</Label>
              <Input
                id="pomo-break"
                type="number"
                min={1}
                max={60}
                value={state.breakMin}
                onChange={(e) =>
                  setDurations(state.focusMin, Math.max(1, Number(e.target.value) || 5))
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("module")}</Label>
            <ModuleSelect
              modules={modules}
              value={state.moduleId}
              onChange={(v) => setState((s) => ({ ...s, moduleId: v }))}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
