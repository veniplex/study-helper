"use client"

import * as React from "react"
import { Loader2, Send } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { saveSmtp, sendTestEmail } from "@/app/[locale]/(app)/admin/actions"

type Smtp = {
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  from: string
}

export function SmtpForm({ initial }: { initial: Smtp | null }) {
  const t = useTranslations("admin.email")
  const tCommon = useTranslations("common")
  const [pending, setPending] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [smtp, setSmtp] = React.useState<Smtp>(
    initial ?? { host: "", port: 587, secure: false, user: "", pass: "", from: "" }
  )

  async function save() {
    setPending(true)
    try {
      await saveSmtp(smtp)
      toast.success(t("saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  async function test() {
    setTesting(true)
    const result = await sendTestEmail()
    setTesting(false)
    if (result.ok) toast.success(t("testSent"))
    else toast.error(t("testFailed", { error: result.error }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="host">{t("host")}</Label>
          <Input
            id="host"
            value={smtp.host}
            placeholder="smtp.example.com"
            onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="port">{t("port")}</Label>
          <Input
            id="port"
            type="number"
            value={smtp.port}
            onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-user">{t("user")}</Label>
          <Input
            id="smtp-user"
            value={smtp.user ?? ""}
            onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-pass">{t("pass")}</Label>
          <Input
            id="smtp-pass"
            type="password"
            value={smtp.pass ?? ""}
            onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="from">{t("from")}</Label>
          <Input
            id="from"
            value={smtp.from}
            placeholder="StudyHelper <noreply@example.com>"
            onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2 self-end pb-1.5">
          <Switch
            id="secure"
            checked={smtp.secure}
            onCheckedChange={(secure) => setSmtp({ ...smtp, secure })}
          />
          <Label htmlFor="secure">{t("secure")}</Label>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {tCommon("save")}
        </Button>
        <Button variant="outline" onClick={test} disabled={testing || !initial}>
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {t("sendTest")}
        </Button>
      </CardFooter>
    </Card>
  )
}
