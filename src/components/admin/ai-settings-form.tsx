"use client"

import * as React from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { saveAiSettings, testAiProvider } from "@/app/[locale]/(app)/admin/actions"
import type { AiSettings } from "@/lib/settings"

const PROVIDER_TYPES = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "groq",
  "ollama",
  "openai-compatible",
] as const

type ProviderDraft = {
  id: string
  type: (typeof PROVIDER_TYPES)[number]
  name: string
  apiKey: string
  baseUrl: string
  modelsText: string
  embeddingModel: string
}

export function AiSettingsForm({ initial }: { initial: AiSettings }) {
  const t = useTranslations("admin.ai")
  const tCommon = useTranslations("common")
  const [pending, setPending] = React.useState(false)
  const [providers, setProviders] = React.useState<ProviderDraft[]>(
    initial.providers.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      apiKey: p.apiKey ?? "",
      baseUrl: p.baseUrl ?? "",
      modelsText: p.models.join(", "),
      embeddingModel: p.embeddingModel ?? "",
    }))
  )
  const [defaultModel, setDefaultModel] = React.useState(initial.defaultModel ?? "")
  const [defaultEmbeddingModel, setDefaultEmbeddingModel] = React.useState(
    initial.defaultEmbeddingModel ?? ""
  )
  const [monthlyLimit, setMonthlyLimit] = React.useState(initial.monthlyTokenLimitPerUser)
  const [useBatchApi, setUseBatchApi] = React.useState(initial.useBatchApi ?? false)

  const modelOptions = providers.flatMap((p) =>
    p.modelsText
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .map((m) => `${p.id}:${m}`)
  )
  const embeddingOptions = providers
    .filter((p) => p.embeddingModel.trim())
    .map((p) => `${p.id}:${p.embeddingModel.trim()}`)

  function update(index: number, patch: Partial<ProviderDraft>) {
    setProviders((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  const [testing, setTesting] = React.useState<string | null>(null)

  /** One-token live request against the (possibly unsaved) provider config. */
  async function testProvider(index: number) {
    const p = providers[index]
    setTesting(p.id)
    try {
      const result = await testAiProvider({
        id: p.id,
        type: p.type,
        name: p.name || p.id,
        apiKey: p.apiKey || undefined,
        baseUrl: p.baseUrl || undefined,
        models: p.modelsText
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
        embeddingModel: p.embeddingModel.trim() || undefined,
      })
      if (result.ok) toast.success(t("testOk"))
      else toast.error(t("testFailed", { error: result.error }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setTesting(null)
    }
  }

  async function save() {
    setPending(true)
    try {
      await saveAiSettings({
        providers: providers
          .filter((p) => p.id && p.name)
          .map((p) => ({
            id: p.id,
            type: p.type,
            name: p.name,
            apiKey: p.apiKey || undefined,
            baseUrl: p.baseUrl || undefined,
            models: p.modelsText
              .split(",")
              .map((m) => m.trim())
              .filter(Boolean),
            embeddingModel: p.embeddingModel.trim() || undefined,
          })),
        defaultModel: defaultModel || undefined,
        defaultEmbeddingModel: defaultEmbeddingModel || undefined,
        monthlyTokenLimitPerUser: monthlyLimit,
        useBatchApi,
      })
      toast.success(t("saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {providers.map((p, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("providerId")}</Label>
                <Input
                  value={p.id}
                  placeholder="anthropic"
                  onChange={(e) =>
                    update(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("type")}</Label>
                <Select
                  value={p.type}
                  onValueChange={(v) => update(i, { type: v as ProviderDraft["type"] })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{p.type}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("name")}</Label>
                <Input
                  value={p.name}
                  placeholder="Anthropic"
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("apiKeyOptional")}</Label>
                <Input
                  type="password"
                  value={p.apiKey}
                  onChange={(e) => update(i, { apiKey: e.target.value })}
                />
              </div>
              <div className="col-span-full space-y-1.5">
                <Label>
                  {p.type === "openai-compatible" || p.type === "ollama"
                    ? t("baseUrlRequired")
                    : t("baseUrl")}
                </Label>
                <Input
                  value={p.baseUrl}
                  placeholder={
                    p.type === "ollama" ? "http://localhost:11434" : "https://api.example.com/v1"
                  }
                  onChange={(e) => update(i, { baseUrl: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("models")}</Label>
                <Input
                  value={p.modelsText}
                  placeholder="claude-sonnet-5, claude-haiku-4-5-20251001"
                  onChange={(e) => update(i, { modelsText: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("embeddingModel")}</Label>
                <Input
                  value={p.embeddingModel}
                  placeholder="text-embedding-3-small"
                  onChange={(e) => update(i, { embeddingModel: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={testing === p.id}
                onClick={() => void testProvider(i)}
              >
                {testing === p.id && <Loader2 className="size-3.5 animate-spin" />}
                {t("testConnection")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setProviders((list) => list.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3.5" />
                {t("removeProvider")}
              </Button>
            </div>
          </div>
        ))}

        <Button
          variant="outline"
          onClick={() =>
            setProviders((list) => [
              ...list,
              {
                id: "",
                type: "anthropic",
                name: "",
                apiKey: "",
                baseUrl: "",
                modelsText: "",
                embeddingModel: "",
              },
            ])
          }
        >
          <Plus className="size-4" />
          {t("addProvider")}
        </Button>

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("defaultModel")}</Label>
            <Select value={defaultModel} onValueChange={(v) => setDefaultModel(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue>{defaultModel || t("noModels")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("defaultEmbeddingModel")}</Label>
            <Select
              value={defaultEmbeddingModel}
              onValueChange={(v) => setDefaultEmbeddingModel(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{defaultEmbeddingModel || t("noModels")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {embeddingOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("monthlyLimit")}</Label>
            <Input
              type="number"
              min={0}
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(Number(e.target.value))}
            />
          </div>
          <div className="col-span-full space-y-1.5">
            <div className="flex items-center gap-2">
              <Switch id="useBatchApi" checked={useBatchApi} onCheckedChange={setUseBatchApi} />
              <Label htmlFor="useBatchApi">{t("useBatchApi")}</Label>
            </div>
            <p className="text-muted-foreground text-xs">{t("useBatchApiHint")}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {tCommon("save")}
        </Button>
      </CardFooter>
    </Card>
  )
}
