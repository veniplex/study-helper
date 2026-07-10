"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { authClient } from "@/lib/auth/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const AVATAR_SIZE = 128

/** Downscale the picked image to a small square JPEG data URL. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable")
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE
  )
  bitmap.close()
  return canvas.toDataURL("image/jpeg", 0.85)
}

export function ProfileSettings({
  initialName,
  initialImage,
  email,
}: {
  initialName: string
  initialImage: string | null
  email?: string
}) {
  const t = useTranslations("settings.profile")
  const router = useRouter()
  const [name, setName] = React.useState(initialName)
  const [image, setImage] = React.useState<string | null>(initialImage)
  const [pending, setPending] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const initials = (name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  async function pickImage(file: File) {
    try {
      setImage(await toAvatarDataUrl(file))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function save() {
    setPending(true)
    try {
      const { error } = await authClient.updateUser({
        name: name.trim() || initialName,
        image,
      })
      if (error) throw new Error(error.message)
      toast.success(t("saved"))
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {image ? <AvatarImage src={image} alt={name} /> : null}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {t("changeAvatar")}
            </Button>
            {image && (
              <Button variant="ghost" size="sm" onClick={() => setImage(null)}>
                {t("removeAvatar")}
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void pickImage(file)
              e.target.value = ""
            }}
          />
        </div>
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="profile-name">{t("name")}</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </div>
        {email && (
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="profile-email">{t("email")}</Label>
            <Input id="profile-email" value={email} readOnly disabled />
            <p className="text-muted-foreground text-xs">{t("emailHint")}</p>
          </div>
        )}
        <Button onClick={save} disabled={pending}>
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  )
}
