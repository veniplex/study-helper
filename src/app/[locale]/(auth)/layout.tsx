import { GraduationCap } from "lucide-react"
import { getAppName } from "@/lib/settings"

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const appName = await getAppName()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-2.5">
        <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
          <GraduationCap className="size-5" />
        </div>
        <span className="font-heading text-lg font-semibold tracking-tight">{appName}</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
