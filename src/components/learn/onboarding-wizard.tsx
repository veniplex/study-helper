"use client"

import * as React from "react"
import { ArrowRight, Check, GraduationCap, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { ProgramDialog } from "@/components/studies/program-dialog"
import { SemesterDialog } from "@/components/studies/semester-dialog"
import { ModuleDialog } from "@/components/studies/module-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Full onboarding flow shown on the dashboard until the user has a first
 * module. Each step opens the matching dialog; finishing a step (which calls
 * router.refresh in the dialog) advances the flow via fresh server props.
 */
export function OnboardingWizard({
  name,
  hasProgram,
  hasSemester,
  hasModule,
  programId,
  semesterId,
  isAdmin,
  aiConfigured,
}: {
  name: string
  hasProgram: boolean
  hasSemester: boolean
  hasModule: boolean
  programId: string | null
  semesterId: string | null
  isAdmin: boolean
  aiConfigured: boolean
}) {
  const t = useTranslations("onboarding")
  const [openStep, setOpenStep] = React.useState<null | "program" | "semester" | "module">(null)

  const steps = [
    { key: "program" as const, done: hasProgram, enabled: true },
    { key: "semester" as const, done: hasSemester, enabled: hasProgram },
    { key: "module" as const, done: hasModule, enabled: hasSemester },
  ]
  const current = steps.find((s) => !s.done && s.enabled) ?? steps[steps.length - 1]
  const allDone = steps.every((s) => s.done)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <GraduationCap className="size-5" />
            </span>
            <div>
              <CardTitle className="text-base">{t("heroTitle", { name })}</CardTitle>
              <p className="text-muted-foreground text-sm">{t("intro")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {steps.map((step, i) => {
            const isCurrent = step.key === current?.key && !step.done
            return (
              <div
                key={step.key}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5",
                  isCurrent && "bg-accent/50"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step.done
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {step.done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", step.done && "text-muted-foreground")}>
                    {t(`step_${step.key}`)}
                  </p>
                  <p className="text-muted-foreground text-xs">{t(`step_${step.key}_desc`)}</p>
                </div>
                {isCurrent && step.enabled && (
                  <Button size="sm" onClick={() => setOpenStep(step.key)}>
                    {t("start")}
                    <ArrowRight className="size-3.5" />
                  </Button>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {allDone && semesterId && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <ArrowRight className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("planTitle")}</p>
              <p className="text-muted-foreground text-xs">{t("planDesc")}</p>
            </div>
            <Button size="sm" nativeButton={false} render={<Link href={`/plan/${semesterId}`} />}>
              {t("planCta")}
            </Button>
          </CardContent>
        </Card>
      )}

      {isAdmin && !aiConfigured && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("aiTitle")}</p>
              <p className="text-muted-foreground text-xs">{t("aiDesc")}</p>
            </div>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/admin/ai" />}>
              {t("aiCta")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Controlled dialogs driven by the wizard steps */}
      <ProgramDialog
        hideTrigger
        open={openStep === "program"}
        onOpenChange={(o) => setOpenStep(o ? "program" : null)}
      />
      {programId && (
        <SemesterDialog
          programId={programId}
          open={openStep === "semester"}
          onOpenChange={(o) => setOpenStep(o ? "semester" : null)}
        />
      )}
      {semesterId && (
        <ModuleDialog
          semesterId={semesterId}
          open={openStep === "module"}
          onOpenChange={(o) => setOpenStep(o ? "module" : null)}
        />
      )}
    </div>
  )
}
