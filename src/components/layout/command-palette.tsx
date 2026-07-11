"use client"

import * as React from "react"
import { CalendarDays, ClipboardList, File, FileText, Layers, ListChecks, Search, User } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { navItems } from "@/config/nav"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

type ModuleScoped = { moduleId: string; programId: string; moduleName: string }

type SearchResults = {
  modules: { id: string; name: string; programId: string }[]
  materials: { id: string; name: string; kind: string; url: string | null }[]
  events: { id: string; title: string; startsAt: string }[]
  decks: ({ id: string; name: string } & ModuleScoped)[]
  quizzes: ({ id: string; title: string } & ModuleScoped)[]
  assignments: ({ id: string; title: string } & ModuleScoped)[]
  contacts: ({ id: string; name: string } & ModuleScoped)[]
}

const EMPTY: SearchResults = {
  modules: [],
  materials: [],
  events: [],
  decks: [],
  quizzes: [],
  assignments: [],
  contacts: [],
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchResults>(EMPTY)
  const t = useTranslations("commandPalette")
  const tNav = useTranslations("nav")
  const tSearch = useTranslations("search")
  const tCommon = useTranslations("common")
  const router = useRouter()

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const abortRef = React.useRef<AbortController | null>(null)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function onQueryChange(value: string) {
    setQuery(value)
    abortRef.current?.abort()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (value.trim().length < 2) {
      setResults(EMPTY)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        })
        if (res.ok) setResults({ ...EMPTY, ...(await res.json()) })
      } catch {
        // aborted or offline — ignore
      }
    }, 200)
  }

  function go(href: string) {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-muted-foreground h-9 w-9 justify-center p-0 sm:w-72 sm:justify-start sm:px-3 lg:w-96"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden truncate text-sm font-normal sm:inline">{tCommon("search")}</span>
        <kbd className="bg-muted pointer-events-none ml-auto hidden rounded border px-1.5 font-mono text-[10px] font-medium sm:inline-block">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
        <CommandInput placeholder={t("placeholder")} value={query} onValueChange={onQueryChange} />
        <CommandList>
          <CommandEmpty>{t("empty")}</CommandEmpty>
          {results.modules.length > 0 && (
            <CommandGroup heading={tSearch("modules")}>
              {results.modules.map((m) => (
                <CommandItem key={m.id} onSelect={() => go(`/studies/${m.programId}/${m.id}`)}>
                  <FileText className="size-4" />
                  {m.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.materials.length > 0 && (
            <CommandGroup heading={tSearch("materials")}>
              {results.materials.map((m) => (
                <CommandItem
                  key={m.id}
                  onSelect={() => {
                    if (m.kind === "link" && m.url) {
                      setOpen(false)
                      window.open(m.url, "_blank", "noopener,noreferrer")
                    } else go(`/materials/${m.id}`)
                  }}
                >
                  <File className="size-4" />
                  {m.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.events.length > 0 && (
            <CommandGroup heading={tSearch("events")}>
              {results.events.map((e) => (
                <CommandItem key={e.id} onSelect={() => go("/calendar")}>
                  <CalendarDays className="size-4" />
                  {e.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.decks.length > 0 && (
            <CommandGroup heading={tSearch("decks")}>
              {results.decks.map((d) => (
                <CommandItem
                  key={d.id}
                  onSelect={() => go(`/studies/${d.programId}/${d.moduleId}/decks/${d.id}`)}
                >
                  <Layers className="size-4" />
                  {d.name}
                  <span className="text-muted-foreground ml-auto text-xs">{d.moduleName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.quizzes.length > 0 && (
            <CommandGroup heading={tSearch("quizzes")}>
              {results.quizzes.map((d) => (
                <CommandItem
                  key={d.id}
                  onSelect={() => go(`/studies/${d.programId}/${d.moduleId}/quizzes/${d.id}`)}
                >
                  <ListChecks className="size-4" />
                  {d.title}
                  <span className="text-muted-foreground ml-auto text-xs">{d.moduleName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.assignments.length > 0 && (
            <CommandGroup heading={tSearch("assignments")}>
              {results.assignments.map((d) => (
                <CommandItem
                  key={d.id}
                  onSelect={() => go(`/studies/${d.programId}/${d.moduleId}/assignments`)}
                >
                  <ClipboardList className="size-4" />
                  {d.title}
                  <span className="text-muted-foreground ml-auto text-xs">{d.moduleName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.contacts.length > 0 && (
            <CommandGroup heading={tSearch("contacts")}>
              {results.contacts.map((d) => (
                <CommandItem
                  key={d.id}
                  onSelect={() => go(`/studies/${d.programId}/${d.moduleId}`)}
                >
                  <User className="size-4" />
                  {d.name}
                  <span className="text-muted-foreground ml-auto text-xs">{d.moduleName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading={t("navigation")}>
            {navItems.map((item) => (
              <CommandItem key={item.key} onSelect={() => go(item.href)}>
                <item.icon className="size-4" />
                {tNav(item.key)}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
